import { describe, expect, it, vi } from "vitest";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RolesGuard } from "@shared/rbac";

function makeGuard(requiredRoles: string[]): RolesGuard {
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(requiredRoles),
  } as unknown as Reflector;
  return new RolesGuard(reflector);
}

function makeCtx(role?: string, spoofedHeaderRole?: string) {
  const headers: Record<string, string | undefined> = {};
  if (spoofedHeaderRole) {
    headers["x-user-role"] = spoofedHeaderRole;
  }
  const user = role ? { role } : undefined;

  return {
    switchToHttp: () => ({ getRequest: () => ({ headers, user }) }),
    getHandler: vi.fn(),
    getClass: vi.fn(),
  } as any;
}

describe("RolesGuard", () => {
  it("allows enterprise admin when a route still requires legacy admin", () => {
    expect(makeGuard(["admin"]).canActivate(makeCtx("ENTERPRISE_ADMIN"))).toBe(
      true,
    );
  });

  it("allows fleet admin when a route still requires legacy fleet_manager", () => {
    expect(makeGuard(["fleet_manager"]).canActivate(makeCtx("FLEET_ADMIN"))).toBe(
      true,
    );
  });

  it("allows super admin regardless of route role list", () => {
    expect(makeGuard(["DISPATCHER"]).canActivate(makeCtx("SUPER_ADMIN"))).toBe(
      true,
    );
  });

  it("rejects unrelated canonical roles", () => {
    expect(() =>
      makeGuard(["admin"]).canActivate(makeCtx("DISPATCHER")),
    ).toThrow(ForbiddenException);
  });

  it("rejects a spoofed x-user-role header when request.user is unset", () => {
    // No request.user (unauthenticated request), only a client-controlled
    // header claiming an admin role. Must never be trusted.
    expect(() =>
      makeGuard(["DISPATCHER"]).canActivate(makeCtx(undefined, "SUPER_ADMIN")),
    ).toThrow(UnauthorizedException);
  });

  it("ignores a spoofed x-user-role header even when request.user has a different, lesser role", () => {
    // request.user says DISPATCHER; header claims SUPER_ADMIN. The header
    // must be fully ignored — only request.user.role counts.
    expect(() =>
      makeGuard(["admin"]).canActivate(makeCtx("DISPATCHER", "SUPER_ADMIN")),
    ).toThrow(ForbiddenException);
  });
});
