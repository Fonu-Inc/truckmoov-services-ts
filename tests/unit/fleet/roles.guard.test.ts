import { describe, expect, it, vi } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RolesGuard } from "@shared/rbac";

function makeGuard(requiredRoles: string[]): RolesGuard {
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(requiredRoles),
  } as unknown as Reflector;
  return new RolesGuard(reflector);
}

function makeCtx(role?: string) {
  const headers: Record<string, string | undefined> = {};
  if (role) {
    headers["x-user-role"] = role;
  }

  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
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

  it("rejects unrelated canonical roles", () => {
    expect(() =>
      makeGuard(["admin"]).canActivate(makeCtx("DISPATCHER")),
    ).toThrow(ForbiddenException);
  });
});
