import { describe, expect, it } from "vitest";
import { GetSystemTenantBillingUseCase } from "../../../apps/auth/src/get-system-tenant-billing.use-case";
import { InMemoryTenantCollectionsRepository } from "../../../apps/auth/src/in-memory-tenant-collections.repository";
import { InMemoryWalletTopUpRepository } from "../../../apps/auth/src/in-memory-wallet-top-up.repository";
import { InMemoryOnboardingPaymentRepository } from "../../../apps/auth/src/contexts/onboarding/infrastructure/persistence/in-memory-onboarding-payment.repository";
import { lagosMonthBounds } from "../../../apps/auth/src/tenant-collections.repository";

const NOW = new Date("2026-10-15T12:00:00+01:00");
const { from, to } = lagosMonthBounds(NOW);
const inMonth = new Date("2026-10-03T09:00:00+01:00");
const lastMonth = new Date("2026-09-30T23:59:00+01:00");

function payment(id: string, over: Record<string, unknown>) {
  return {
    id, applicationId: "app1", reference: id, provider: "paystack", amountKobo: 1000, authorizationUrl: null,
    billingEmail: "b@x.test", planCode: "p", deviceCount: 1, orderSummary: null, quotationId: null, invoiceId: null,
    method: "card", customerName: null, note: null, autoReconciled: true, status: "paid", paidAt: inMonth,
    createdAt: inMonth, updatedAt: inMonth, ...over,
  } as never;
}

async function buildCollections() {
  const payments = new InMemoryOnboardingPaymentRepository();
  const topUps = new InMemoryWalletTopUpRepository();
  const invoices = { findById: async (id: string) => (id === "inv1" ? { tenantId: "t1" } : null) };
  const applications = { findById: async (id: string) => ({ tenantId: id === "app1" ? "t2" : null }) };
  const repo = new InMemoryTenantCollectionsRepository(payments, invoices as never, applications as never, topUps);
  await payments.save(payment("a", { invoiceId: "inv1", amountKobo: 100_000 }));
  await payments.save(payment("b", { amountKobo: 20_000 }));
  await payments.save(payment("wallet", { invoiceId: "inv1", amountKobo: 70_000, method: "wallet" }));
  await payments.save(payment("old", { invoiceId: "inv1", amountKobo: 900_000, paidAt: lastMonth }));
  await payments.save(payment("pending", { invoiceId: "inv1", amountKobo: 800_000, status: "pending", paidAt: null }));
  await topUps.save({ id: "x", tenantId: "t1", amountKobo: 25_000, provider: "p", mobileNumber: "0", status: "success", reference: "r1", settledAt: inMonth, createdAt: inMonth });
  await topUps.save({ id: "y", tenantId: "t1", amountKobo: 33_000, provider: "p", mobileNumber: "0", status: "pending", reference: "r2", settledAt: null, createdAt: inMonth });
  return repo;
}

describe("in-memory tenant collections", () => {
  it("matches the SQL rules: month, paid, no wallet method, top-ups settled", async () => {
    const totals = await (await buildCollections()).collectedKoboByTenant(from, to);
    expect(totals.get("t1")).toBe(125_000);
    expect(totals.get("t2")).toBe(20_000);
  });

  it("finds the latest paid payment", async () => {
    const last = await (await buildCollections()).lastPaymentForTenant("t1");
    expect(last).toMatchObject({ amountKobo: 100_000, method: "card" });
    expect(await (await buildCollections()).lastPaymentForTenant("none")).toBeNull();
  });
});

describe("GetSystemTenantBillingUseCase", () => {
  const actor = { id: "s", role: "SYSTEM_ADMIN", tenantId: "system" };
  const row = { id: "t1", planCode: "gold", planName: "Gold", collectedThisMonthNgn: 1250 };

  function build(over: { tenants?: unknown[]; actorRole?: string } = {}) {
    const dueSoon = { id: "i1", number: "INV-1", dueDate: "2026-11-01", status: "issued", totalKobo: 500_000, amountPaidKobo: 100_000 };
    const dueLater = { ...dueSoon, id: "i2", number: "INV-2", dueDate: "2026-12-01" };
    return new GetSystemTenantBillingUseCase(
      { resolveAccessToken: () => ({ id: "s" }) } as never,
      { findById: async () => ({ ...actor, role: over.actorRole ?? actor.role }) } as never,
      { list: async () => over.tenants ?? [row] } as never,
      { findActiveByTenant: async () => ({ status: "active", deviceCount: 5, periodStart: "2025-11-01", periodEnd: "2026-10-31" }) } as never,
      {
        listForTenant: async () => ({
          items: [{ invoice: dueLater, isRenewal: false }, { invoice: dueSoon, isRenewal: true }],
          openTotalKobo: 900_000,
        }),
      } as never,
      { lastPaymentForTenant: async () => ({ amountKobo: 250_000, paidAt: inMonth, method: "card" }) } as never,
      { rowFor: async () => ({ stage: "in_grace", dueDate: "2026-10-01", graceEndsOn: "2026-10-08", owedKobo: 400_000, suspended: false, suspensionCause: null }) } as never,
      { findByTenantId: async () => ({ balanceKobo: 150_000, lowBalanceThresholdKobo: 200_000, creditEnabled: false, creditLimitKobo: null }) } as never,
      { findByPlanCode: async () => ({ paymentModel: "prepaid" }) } as never,
      { findByTenantId: async () => null } as never,
      { findByTenant: async () => null } as never,
    );
  }

  it("answers in naira with the earliest-due open invoice", async () => {
    const { data } = await build().execute("tok", "t1");
    expect(data).toEqual({
      tenantId: "t1",
      plan: { code: "gold", name: "Gold" },
      billingModel: { kind: "per_device_licence", paymentModel: "prepaid", billingCycle: null, deviceCount: 5 },
      trial: null,
      licence: { status: "active", periodStart: "2025-11-01", validUntil: "2026-10-31" },
      openInvoice: { id: "i1", number: "INV-1", dueDate: "2026-11-01", status: "issued", isRenewal: true, amountOwedNgn: 4000 },
      totalOwedNgn: 9000,
      lastPayment: { amountNgn: 2500, paidAt: inMonth.toISOString(), method: "card" },
      enforcement: { stage: "in_grace", dueDate: "2026-10-01", graceEndsOn: "2026-10-08", owedNgn: 4000, suspended: false, suspensionCause: null },
      wallet: { balanceNgn: 1500, status: "low" },
      collectedThisMonthNgn: 1250,
    });
  });

  it("returns null for pieces not on record", async () => {
    const useCase = build({ tenants: [{ ...row, planCode: null, planName: null }] });
    (useCase as any).licences = { findActiveByTenant: async () => null };
    (useCase as any).invoices = { listForTenant: async () => ({ items: [], openTotalKobo: 0 }) };
    (useCase as any).collections = { lastPaymentForTenant: async () => null };
    (useCase as any).enforcement = { rowFor: async () => null };
    (useCase as any).wallets = { findByTenantId: async () => null };
    (useCase as any).entitlements = { findByPlanCode: async () => null };
    const { data } = await useCase.execute("tok", "t1");
    expect(data).toMatchObject({
      plan: null, billingModel: { kind: null, paymentModel: null, billingCycle: null, deviceCount: null },
      trial: null, licence: null, openInvoice: null, totalOwedNgn: 0, lastPayment: null, enforcement: null, wallet: null,
    });
  });

  it("404s an unknown tenant and refuses non-system actors", async () => {
    await expect(build({ tenants: [] }).execute("tok", "t1")).rejects.toThrow("Tenant not found");
    await expect(build({ actorRole: "OWNER_OPERATOR" }).execute("tok", "t1")).rejects.toThrow("not permitted");
  });
});

describe("tenant list plan state", () => {
  const admin = { id: "s", role: "SYSTEM_ADMIN", tenantId: "system" };
  const member = (id: string, tenantId: string) => ({ id, email: `${id}@x.test`, role: "OWNER_OPERATOR", tenantId, accountStatus: "enabled" });

  async function list(filters: Record<string, unknown>) {
    const { ListSystemTenantsUseCase } = await import("../../../apps/auth/src/list-system-tenants.use-case");
    const { InMemoryTenantTerminationRepository } = await import("../../../apps/auth/src/mikro-tenant-termination.repository");
    const { InMemoryTenantSuspensionRepository } = await import("../../../apps/auth/src/mikro-tenant-suspension.repository");
    const users = [admin, member("u1", "licensed"), member("u2", "bare"), member("u3", "legacy")];
    const useCase = new ListSystemTenantsUseCase(
      { persistence: { backend: "in-memory" } } as never,
      { resolveAccessToken: () => ({ id: "s" }) } as never,
      { findById: async (id: string) => users.find((u) => u.id === id) ?? null, findAll: async () => users } as never,
      { listUserActivity: async () => [] } as never,
      { findAll: async () => [] } as never,
      { findByTenantId: async () => null } as never,
      { findAll: async () => [{ code: "legacy-code", tier: "starter", name: "Legacy Starter" }] } as never,
      new InMemoryTenantTerminationRepository(),
      { findAll: async () => [{ planCode: "gold", quotas: { vehicles: 10 } }] } as never,
      new InMemoryTenantSuspensionRepository(),
      { currentPlanCodes: async () => new Map([["licensed", "gold"], ["legacy", "legacy-code"]]) } as never,
      { list: async () => ({ items: [{ code: "gold", name: "Gold" }], total: 1 }) } as never,
      { collectedKoboByTenant: async () => new Map([["licensed", 150_050]]) } as never,
    );
    return useCase.list("tok", filters);
  }

  it("tells no plan from unlimited and names real plans", async () => {
    const rows = Object.fromEntries((await list({})).map((r) => [r.id, r]));
    expect(rows.bare).toMatchObject({ planAssigned: false, planCode: null, planName: null });
    expect(rows.licensed).toMatchObject({ planAssigned: true, planCode: "gold", planName: "Gold", quotas: { vehicles: 10, drivers: null } });
    expect(rows.legacy).toMatchObject({ planAssigned: true, planName: "Legacy Starter", quotas: { vehicles: null } });
    expect(rows.licensed).toMatchObject({ collectedThisMonthNgn: 1500.5, monthlyRevenueNgn: 1500.5 });
    expect(rows.bare.collectedThisMonthNgn).toBe(0);
  });

  it("filters by planCode, legacy plan tier and collected amount", async () => {
    expect((await list({ planCode: "gold" })).map((r) => r.id)).toEqual(["licensed"]);
    expect((await list({ plan: "starter" })).map((r) => r.id).sort()).toEqual(["bare", "legacy", "licensed"]);
    expect(await list({ plan: "enterprise" })).toEqual([]);
    expect((await list({ revenueFrom: 1000 })).map((r) => r.id)).toEqual(["licensed"]);
    expect((await list({ revenueTo: 10 })).map((r) => r.id).sort()).toEqual(["bare", "legacy"]);
  });
});
