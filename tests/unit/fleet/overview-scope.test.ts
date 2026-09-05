import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { Role } from "@shared/rbac";
import {
  resolveOverviewScope,
  scopeMatchesOwnerOperator,
} from "../../../apps/fleet/src/contexts/fleet/reports/domain/overview-scope";

describe("Overview scope", () => {
  it("gives an enterprise admin the whole tenant", () => {
    const scope = resolveOverviewScope({
      userId: "user-1",
      role: Role.ENTERPRISE_ADMIN,
      tenantId: "tenant-a",
    });

    expect(scope).toEqual({ tenantId: "tenant-a", ownerOperatorId: null });
  });

  it("pins an owner operator to its own records", () => {
    const scope = resolveOverviewScope({
      userId: "operator-7",
      role: Role.OWNER_OPERATOR,
      tenantId: "tenant-a",
    });

    expect(scope).toEqual({ tenantId: "tenant-a", ownerOperatorId: "operator-7" });
  });

  // The overview is deliberately narrower than the operational dashboard.
  it("refuses every other role, including fleet and platform staff", () => {
    for (const role of [
      Role.FLEET_ADMIN,
      Role.OPERATIONS_MANAGER,
      Role.DISPATCHER,
      Role.AGGREGATOR_ADMIN,
      Role.PLATFORM_ADMIN,
      Role.SYSTEM_ADMIN,
      Role.SUPER_ADMIN,
      Role.DRIVER,
    ]) {
      expect(() =>
        resolveOverviewScope({ userId: "user-1", role, tenantId: "tenant-a" }),
      ).toThrow(ForbiddenException);
    }
  });

  it("refuses a token with no tenant", () => {
    expect(() =>
      resolveOverviewScope({ userId: "user-1", role: Role.ENTERPRISE_ADMIN, tenantId: "   " }),
    ).toThrow(UnauthorizedException);
    expect(() => resolveOverviewScope(undefined)).toThrow(UnauthorizedException);
  });

  it("refuses an owner operator whose token carries no identity", () => {
    expect(() =>
      resolveOverviewScope({ role: Role.OWNER_OPERATOR, tenantId: "tenant-a" }),
    ).toThrow(UnauthorizedException);
  });

  it("matches ownership only for the operator that owns the record", () => {
    const operator = { tenantId: "tenant-a", ownerOperatorId: "operator-7" };
    expect(scopeMatchesOwnerOperator(operator, "operator-7")).toBe(true);
    expect(scopeMatchesOwnerOperator(operator, "operator-8")).toBe(false);
    expect(scopeMatchesOwnerOperator(operator, null)).toBe(false);

    const admin = { tenantId: "tenant-a", ownerOperatorId: null };
    expect(scopeMatchesOwnerOperator(admin, "operator-8")).toBe(true);
    expect(scopeMatchesOwnerOperator(admin, null)).toBe(true);
  });
});
