import { describe, expect, it } from "vitest";
import { TenantOrganizationTypeReader } from "../../../apps/auth/src/tenant-organization-type.reader";

describe("TenantOrganizationTypeReader", () => {
  const onboarding = {
    findByTenantId: async (tenantId: string) =>
      tenantId === "t-oo" ? { organizationType: "owner_operator" } : tenantId === "t-broken" ? Promise.reject(new Error("db down")) : null,
  } as never;

  it("returns the tenant's organisation type", async () => {
    expect(await new TenantOrganizationTypeReader(onboarding).of("t-oo")).toBe("owner_operator");
  });

  it("is null when unknown, for the system tenant, or when the lookup fails", async () => {
    const reader = new TenantOrganizationTypeReader(onboarding);
    expect(await reader.of("t-none")).toBeNull();
    expect(await reader.of("system")).toBeNull();
    expect(await reader.of("t-broken")).toBeNull();
    expect(await new TenantOrganizationTypeReader().of("t-oo")).toBeNull();
  });
});
