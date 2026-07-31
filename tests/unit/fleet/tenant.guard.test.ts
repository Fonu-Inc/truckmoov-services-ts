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
  const user = opts.claimedTenant || opts.role
    ? { tenantId: opts.claimedTenant, role: opts.role }
    : undefined;

  return {
    switchToHttp: () => ({ getRequest: () => ({ headers, query, body, user }) }),
    getHandler: vi.fn(),
    getClass: vi.fn(),
  } as any;
}

describe("TenantGuard", () => {
  it("allows when no tenant header is present", () => {
    expect(makeGuard().canActivate(makeCtx({}))).toBe(true);
  });

  it("allows when tenant is supplied by authenticated user context", () => {
    expect(makeGuard().canActivate(makeCtx({ claimedTenant: "t1", role: "DISPATCHER" }))).toBe(true);
  });

  it("allows enterprise admin regardless of tenant context", () => {
    expect(makeGuard().canActivate(makeCtx({ claimedTenant: "t1", role: "ENTERPRISE_ADMIN", queryTenantId: "t2" }))).toBe(true);
  });

  it("allows super admin regardless of tenant context", () => {
    expect(makeGuard().canActivate(makeCtx({ claimedTenant: "t1", role: "SUPER_ADMIN", queryTenantId: "t2" }))).toBe(true);
  });

  it("rejects client-supplied tenant mismatch in query", () => {
    expect(() =>
      makeGuard().canActivate(makeCtx({ claimedTenant: "t1", role: "DISPATCHER", queryTenantId: "t2" })),
    ).toThrow(ForbiddenException);
  });

  it("rejects client-supplied tenant mismatch in body", () => {
    expect(() =>
      makeGuard().canActivate(makeCtx({ claimedTenant: "t1", role: "DISPATCHER", bodyTenantId: "t3" })),
    ).toThrow(ForbiddenException);
  });

  it("allows when client-supplied tenant in query/body matches the authenticated tenant", () => {
    expect(
      makeGuard().canActivate(makeCtx({ claimedTenant: "t1", role: "DISPATCHER", queryTenantId: "t1", bodyTenantId: "t1" })),
    ).toBe(true);
  });

  it("bypasses when SKIP_TENANT_KEY metadata is set", () => {
    expect(makeGuard(true).canActivate(makeCtx({ claimedTenant: "t1", queryTenantId: "t2" }))).toBe(true);
  });
});
