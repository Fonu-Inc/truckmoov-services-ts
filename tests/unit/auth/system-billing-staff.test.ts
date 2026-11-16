import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { Role } from "@shared/rbac";
import { SYSTEM_TENANT_ID } from "@shared/identity";
import { SystemBillingInvoicesController } from "../../../apps/auth/src/system-billing-invoices.controller";
import { SystemBillingQuotationsController } from "../../../apps/auth/src/system-billing-quotations.controller";
import { SystemBillingPricingController } from "../../../apps/auth/src/system-billing-pricing.controller";

const useCase = { execute: async () => "ok" };
const resolver = (role: string, tenantId: string) =>
  ({ resolve: async () => ({ userId: "u1", name: "U", email: "u@x.co", role, tenantId }) }) as never;

function controllers(role: string, tenantId: string) {
  const actors = resolver(role, tenantId);
  const u = useCase as never;
  return {
    invoices: new SystemBillingInvoicesController(actors, u, u, u, u, u),
    quotations: new SystemBillingQuotationsController(actors, u, u),
    pricing: new SystemBillingPricingController(actors, u, u, u, u, u, u, u, u),
  };
}

const calls = (c: ReturnType<typeof controllers>) => [
  () => c.invoices.summary("Bearer t"),
  () => c.invoices.invoices({} as never, "Bearer t"),
  () => c.invoices.invoice("i1", "Bearer t"),
  () => c.invoices.payments({} as never, "Bearer t"),
  () => c.invoices.payment("p1", "Bearer t"),
  () => c.quotations.list({} as never, "Bearer t"),
  () => c.quotations.get("q1", "Bearer t"),
  () => c.pricing.list({} as never, "Bearer t"),
  () => c.pricing.get("m2m", "Bearer t"),
  () => c.pricing.create({} as never, "Bearer t"),
  () => c.pricing.update("m2m", {} as never, "Bearer t"),
  () => c.pricing.activate("m2m", "Bearer t"),
  () => c.pricing.deactivate("m2m", "Bearer t"),
  () => c.pricing.history({} as never, "Bearer t"),
  () => c.pricing.installationPrice("Bearer t"),
  () => c.pricing.setInstallationPrice({} as never, "Bearer t"),
];

describe("system billing routes are platform staff only", () => {
  it("refuses a tenant admin with 403", async () => {
    for (const call of calls(controllers(Role.ENTERPRISE_ADMIN, "tenant-a"))) {
      await expect(call()).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  it("refuses a staff role held outside the system tenant", async () => {
    for (const call of calls(controllers(Role.SYSTEM_ADMIN, "tenant-a"))) {
      await expect(call()).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  it("serves a system admin", async () => {
    for (const call of calls(controllers(Role.SYSTEM_ADMIN, SYSTEM_TENANT_ID))) {
      await expect(call()).resolves.toBe("ok");
    }
  });
});
