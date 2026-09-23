import { NotFoundException, type ExecutionContext } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { PlatformActorGuard } from "../../../apps/fleet/src/platform-actor.guard";

function contextFor(user?: { role?: string; tenantId?: string }): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => ({ user }) }) } as never;
}

describe("PlatformActorGuard", () => {
  const guard = new PlatformActorGuard();

  it("admits platform staff", () => {
    expect(guard.canActivate(contextFor({ role: "PLATFORM_ADMIN", tenantId: "system" }))).toBe(true);
  });

  // Refused as a missing route, so the caller learns nothing about why.
  it("refuses a platform admin held inside a customer tenant", () => {
    expect(() => guard.canActivate(contextFor({ role: "PLATFORM_ADMIN", tenantId: "tenant-a" }))).toThrow(
      NotFoundException,
    );
  });

  it("refuses a tenant role and an anonymous caller", () => {
    expect(() => guard.canActivate(contextFor({ role: "FLEET_ADMIN", tenantId: "tenant-a" }))).toThrow(
      NotFoundException,
    );
    expect(() => guard.canActivate(contextFor())).toThrow(NotFoundException);
  });
});
