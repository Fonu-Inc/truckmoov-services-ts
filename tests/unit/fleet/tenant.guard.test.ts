import { describe, expect, it, vi } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { TenantGuard } from "../../../apps/fleet/src/tenant.guard";

function makeGuard(skipMeta = false): TenantGuard {
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(skipMeta),
  } as unknown as Reflector;
  return new TenantGuard(reflector);
}

function makeCtx(opts: {
  claimedTenant?: string;
  role?: string;
  queryTenantId?: string;
  bodyTenantId?: string;
}) {
  const headers: Record<string, string | undefined> = {};
  if (opts.claimedTenant) headers["x-tenant-id"] = opts.claimedTenant;
  if (opts.role) headers["x-user-role"] = opts.role;
  const query: Record<string, string | undefined> = {};
  if (opts.queryTenantId) query["tenantId"] = opts.queryTenantId;
  const body: Record<string, string | undefined> = {};
  if (opts.bodyTenantId) body["tenantId"] = opts.bodyTenantId;
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers, query, body }) }),
    getHandler: vi.fn(),
    getClass: vi.fn(),
  } as any;
}

describe("TenantGuard", () => {
  it("allows when no tenant header (single-tenant mode)", () => {
    expect(makeGuard().canActivate(makeCtx({}))).toBe(true);
  });

  it("allows admin regardless of tenant mismatch", () => {
    expect(makeGuard().canActivate(makeCtx({ claimedTenant: "t1", role: "admin", queryTenantId: "t2" }))).toBe(true);
  });

  it("allows enterprise admin regardless of tenant mismatch", () => {
    expect(makeGuard().canActivate(makeCtx({ claimedTenant: "t1", role: "ENTERPRISE_ADMIN", queryTenantId: "t2" }))).toBe(true);
  });

  it("allows when claimed tenant matches query param", () => {
    expect(makeGuard().canActivate(makeCtx({ claimedTenant: "t1", queryTenantId: "t1" }))).toBe(true);
  });

  it("throws 403 when tenant mismatch in query", () => {
    expect(() => makeGuard().canActivate(makeCtx({ claimedTenant: "t1", queryTenantId: "t2" }))).toThrow(ForbiddenException);
  });

  it("throws 403 when tenant mismatch in body", () => {
    expect(() => makeGuard().canActivate(makeCtx({ claimedTenant: "t1", bodyTenantId: "t2" }))).toThrow(ForbiddenException);
  });

  it("allows when no requested tenant", () => {
    expect(makeGuard().canActivate(makeCtx({ claimedTenant: "t1" }))).toBe(true);
  });

  it("bypasses when SKIP_TENANT_KEY metadata is set", () => {
    expect(makeGuard(true).canActivate(makeCtx({ claimedTenant: "t1", queryTenantId: "t2" }))).toBe(true);
  });
});
