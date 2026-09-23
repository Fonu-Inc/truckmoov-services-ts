import { describe, expect, it } from "vitest";
import { PERMISSION_CATALOG, PREDEFINED_ROLES, isPermission, portalOfPermission } from "@shared/access";
import { Role, SYSTEM_ROLES, TENANT_ROLES } from "@shared/rbac";

describe("the permission catalog", () => {
  it("has each permission once", () => {
    const keys = PERMISSION_CATALOG.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("puts every permission in exactly the portal its name says", () => {
    for (const entry of PERMISSION_CATALOG) {
      expect(entry.key.startsWith(`${entry.portal}.`)).toBe(true);
    }
  });
});

describe("predefined roles", () => {
  it("exist for every role label", () => {
    for (const role of Object.values(Role)) {
      expect(PREDEFINED_ROLES[role], role).toBeDefined();
    }
  });

  it("hold only catalog permissions from their own portal", () => {
    for (const [role, bundle] of Object.entries(PREDEFINED_ROLES)) {
      for (const permission of bundle.permissions) {
        expect(isPermission(permission), `${role}: ${permission}`).toBe(true);
        expect(portalOfPermission(permission), `${role}: ${permission}`).toBe(bundle.portal);
      }
    }
  });

  // A tenant role can never carry an admin permission, however its bundle is edited.
  it("keep system roles in the admin portal and tenant roles in the tenant portal", () => {
    for (const role of SYSTEM_ROLES) expect(PREDEFINED_ROLES[role].portal).toBe("admin");
    for (const role of TENANT_ROLES) expect(PREDEFINED_ROLES[role].portal).toBe("tenant");
  });
});
