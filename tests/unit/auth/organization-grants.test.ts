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
    expect(withOrganizationGrants({ role: "DISPATCHER", customRoleId: null }, read, "owner_operator")).toEqual(read);
  });
});
