import { describe, expect, it } from "vitest";
import { holdsMisplacedSystemRole, isPlatformActor, SYSTEM_TENANT_ID } from "@shared/identity";
import { INVITABLE_ROLES, Role, SYSTEM_ROLES, TENANT_ROLES } from "@shared/rbac";

describe("who counts as platform staff", () => {
  it("needs a system role in the system tenant", () => {
    expect(isPlatformActor({ role: Role.PLATFORM_ADMIN, tenantId: SYSTEM_TENANT_ID })).toBe(true);
  });

  it("refuses a system role held inside a customer tenant", () => {
    expect(isPlatformActor({ role: Role.PLATFORM_ADMIN, tenantId: "tenant-a" })).toBe(false);
    expect(holdsMisplacedSystemRole({ role: Role.PLATFORM_ADMIN, tenantId: "tenant-a" })).toBe(true);
  });

  it("refuses a tenant role in the system tenant", () => {
    expect(isPlatformActor({ role: Role.FLEET_ADMIN, tenantId: SYSTEM_TENANT_ID })).toBe(false);
  });
});

describe("role populations", () => {
  it("keeps system and tenant roles apart", () => {
    expect(SYSTEM_ROLES.filter((role) => TENANT_ROLES.includes(role))).toEqual([]);
  });

  it("never lets a tenant invite a system role", () => {
    expect(INVITABLE_ROLES.filter((role) => SYSTEM_ROLES.includes(role))).toEqual([]);
  });
});
