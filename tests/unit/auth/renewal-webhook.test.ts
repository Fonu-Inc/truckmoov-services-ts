import "reflect-metadata";
import { ServiceUnavailableException } from "@nestjs/common";
import { PATH_METADATA, METHOD_METADATA } from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PERMISSION_CATALOG, PORTALS_KEY, REQUIREMENT_KEY, neededPermissions, type Requirement } from "@shared/access";
import { OnboardingController } from "../../../apps/auth/src/onboarding.controller";
import { TenantBillingController } from "../../../apps/auth/src/tenant-billing.controller";

const PAID = { amountKobo: 3_000_000, currency: "NGN", channel: "card" };

function build(callback: Record<string, unknown>) {
  const mocks = {
    confirm: vi.fn().mockResolvedValue(undefined),
    activate: vi.fn().mockResolvedValue(undefined),
    topUp: vi.fn().mockResolvedValue({ outcome: "unknown_reference", tenantId: null }),
    renewal: vi.fn().mockResolvedValue({ outcome: "renewed" }),
    restore: { onPaymentSettled: vi.fn(), onApplicationPaymentSettled: vi.fn() },
  };
  const controller = Object.create(OnboardingController.prototype);
  Object.assign(controller, {
    logger: { error: vi.fn() },
    gatewayRegistry: {
      configured: () => [{}],
      parse: () => ({ provider: "paystack", succeeded: true, reference: "RNW-1", metadata: {}, ...PAID, ...callback }),
    },
    confirmApplicationPayment: { execute: mocks.confirm },
    activateSubscriptionUseCase: { execute: mocks.activate },
    settleWalletTopUpUseCase: { execute: mocks.topUp },
    settleRenewalPaymentUseCase: { execute: mocks.renewal },
    paymentEventService: { emit: vi.fn() },
    enforcementRestore: mocks.restore,
  });
  return { ...mocks, call: () => controller.paystackWebhook({ headers: {}, rawBody: Buffer.from("{}") }, {}) };
}

describe("renewal payments in the shared webhook", () => {
  it("routes a renewal callback only to the renewal settler", async () => {
    const ctx = build({ metadata: { kind: "renewal", renewalInvoiceId: "inv-1", applicationId: "app-1" } });

    await expect(ctx.call()).resolves.toEqual({ received: true });

    expect(ctx.renewal).toHaveBeenCalledWith({
      reference: "RNW-1",
      gateway: { succeeded: true, paid: { amountKobo: 3_000_000, currency: "NGN", channel: "card" } },
    });
    expect(ctx.confirm).not.toHaveBeenCalled();
    expect(ctx.activate).not.toHaveBeenCalled();
    expect(ctx.topUp).not.toHaveBeenCalled();
  });

  it("never lets a renewal callback reach the subscription settler even if a tenant id leaks into it", async () => {
    const ctx = build({ metadata: { kind: "renewal", tenantId: "tenant-a", planCode: "pro" } });
    await ctx.call();
    expect(ctx.activate).not.toHaveBeenCalled();
    expect(ctx.topUp).not.toHaveBeenCalled();
  });

  it("does not route onboarding, subscription or top-up callbacks to the renewal settler", async () => {
    for (const metadata of [{ kind: "onboarding" }, { tenantId: "tenant-a", purpose: "wallet_topup" }, {}]) {
      const ctx = build({ metadata });
      await ctx.call();
      expect(ctx.renewal).not.toHaveBeenCalled();
    }
  });

  it("passes a provider failure through so the payment is marked failed", async () => {
    const ctx = build({ succeeded: false, failed: true, metadata: { kind: "renewal" } });
    await ctx.call();
    expect(ctx.renewal).toHaveBeenCalledWith(expect.objectContaining({ gateway: expect.objectContaining({ succeeded: false }) }));
  });

  it("ignores a renewal event that neither succeeded nor failed", async () => {
    const ctx = build({ succeeded: false, metadata: { kind: "renewal" } });
    await ctx.call();
    expect(ctx.renewal).not.toHaveBeenCalled();
  });

  it("asks the provider to retry when renewal settlement throws", async () => {
    const ctx = build({ metadata: { kind: "renewal" } });
    ctx.renewal.mockRejectedValue(new Error("db down"));
    await expect(ctx.call()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe("tenant billing routes", () => {
  const proto = TenantBillingController.prototype as unknown as Record<string, () => void>;
  const routes = Object.getOwnPropertyNames(proto)
    .filter((name) => name !== "constructor" && Reflect.getMetadata(METHOD_METADATA, proto[name]) !== undefined)
    .map((name) => ({
      method: RequestMethod[Reflect.getMetadata(METHOD_METADATA, proto[name]) as number],
      path: Reflect.getMetadata(PATH_METADATA, proto[name]) as string,
    }));

  it("publishes the tenant endpoints under billing", () => {
    expect(Reflect.getMetadata(PATH_METADATA, TenantBillingController)).toBe("billing");
    expect(routes).toEqual(
      expect.arrayContaining([
        { method: "GET", path: "invoices" },
        { method: "GET", path: "invoices/:id" },
        { method: "GET", path: "licence" },
        { method: "POST", path: "invoices/:id/pay-wallet" },
        { method: "POST", path: "invoices/:id/pay-card" },
        { method: "GET", path: "quotations" },
        { method: "GET", path: "quotations/:id" },
        { method: "GET", path: "payments" },
        { method: "GET", path: "payments/:id" },
        { method: "GET", path: "overview" },
        { method: "GET", path: "activity" },
      ]),
    );
    expect(routes).toHaveLength(11);
  });

  it("serves only the tenant portal and needs the wallet top-up permission to pay", () => {
    expect(Reflect.getMetadata(PORTALS_KEY, TenantBillingController)).toEqual(["tenant"]);
    const requirement = Reflect.getMetadata(REQUIREMENT_KEY, TenantBillingController) as Requirement;
    expect(neededPermissions(requirement, "POST")).toEqual(["tenant.bundles.manage"]);
    expect(neededPermissions(requirement, "GET")).toEqual(["tenant.bundles.read"]);
    const known = new Set<string>(PERMISSION_CATALOG.map((entry) => entry.key));
    for (const permission of [...neededPermissions(requirement, "POST"), ...neededPermissions(requirement, "GET")]) {
      expect(known.has(permission)).toBe(true);
    }
  });
});
