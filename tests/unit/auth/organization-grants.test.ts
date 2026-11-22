import { describe, expect, it } from "vitest";
import { withOrganizationGrants } from "../../../apps/auth/src/access-resolver";

describe("Organisation grants", () => {
  const read = ["tenant.bundles.read"] as never[];

  it("lets an owner operator's operations manager buy bundles", () => {
    expect(withOrganizationGrants({ role: "OPERATIONS_MANAGER", customRoleId: null }, read, "owner_operator")).toContain("tenant.bundles.manage");
  });

  it("keeps an enterprise's operations manager, and custom roles, as they are", () => {
    expect(withOrganizationGrants({ role: "OPERATIONS_MANAGER", customRoleId: null }, read, "enterprise")).toEqual(read);
    expect(withOrganizationGrants({ role: "OPERATIONS_MANAGER", customRoleId: null }, read, null)).toEqual(read);
    expect(withOrganizationGrants({ role: "OPERATIONS_MANAGER", customRoleId: "r1" }, read, "owner_operator")).toEqual(read);
  });

  it("lets an owner operator's staff raise and follow support tickets, but not enterprise staff", () => {
    for (const role of ["OPERATIONS_MANAGER", "DISPATCHER", "FINANCE_VIEWER"]) {
      expect(withOrganizationGrants({ role, customRoleId: null }, [], "owner_operator")).toEqual(expect.arrayContaining(["tenant.support.read", "tenant.support.manage"]));
      expect(withOrganizationGrants({ role, customRoleId: null }, [], "enterprise")).toEqual([]);
    }
    expect(withOrganizationGrants({ role: "DISPATCHER", customRoleId: null }, [], "owner_operator")).not.toContain("tenant.bundles.manage");
  });
});
