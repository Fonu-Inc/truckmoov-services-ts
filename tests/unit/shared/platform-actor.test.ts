import { describe, expect, it } from "vitest";
import { holdsMisplacedSystemRole, isInstallerActor, isPlatformActor, portalFor, SYSTEM_TENANT_ID } from "@shared/identity";
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

describe("installers", () => {
  it("have their own portal in the system tenant and are never platform staff", () => {
    const installer = { role: Role.INSTALLER, tenantId: SYSTEM_TENANT_ID };
    expect(portalFor(installer)).toBe("installer");
    expect(isInstallerActor(installer)).toBe(true);
    expect(isPlatformActor(installer)).toBe(false);
  });

  it("count as misplaced anywhere else, and get no installer portal there", () => {
    const misplaced = { role: Role.INSTALLER, tenantId: "tenant-a" };
    expect(holdsMisplacedSystemRole(misplaced)).toBe(true);
    expect(portalFor(misplaced)).toBe("tenant");
  });
});

describe("role populations", () => {
  it("keeps system and tenant roles apart", () => {
    expect(SYSTEM_ROLES.filter((role) => TENANT_ROLES.includes(role))).toEqual([]);
  });

  it("never lets a tenant invite a system role", () => {
    expect(INVITABLE_ROLES.filter((role) => SYSTEM_ROLES.includes(role))).toEqual([]);
  });

  it("keeps installers out of every other population", () => {
    expect([...SYSTEM_ROLES, ...TENANT_ROLES, ...INVITABLE_ROLES]).not.toContain(Role.INSTALLER);
  });
});
