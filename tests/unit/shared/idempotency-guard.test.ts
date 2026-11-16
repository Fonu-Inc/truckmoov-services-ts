import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { ConflictException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IdempotencyGuard } from "@shared/rbac";
import { UserTokenSigner } from "@shared/identity";

function call(guard: IdempotencyGuard, tenantId: string) {
  const response = Object.assign(new EventEmitter(), { statusCode: 201 });
  const request = { method: "POST", originalUrl: "/fleet/vehicles", headers: { "idempotency-key": "k1" }, user: { tenantId } };
  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as never;
  const finish = (status: number) => {
    response.statusCode = status;
    response.emit("finish");
  };
  return { result: guard.canActivate(context), finish };
}

describe("IdempotencyGuard", () => {
  const guard = () => new IdempotencyGuard({ getAllAndOverride: () => true } as unknown as Reflector, null);

  it("scopes the key to the tenant", async () => {
    const g = guard();
    await expect(call(g, "t1").result).resolves.toBe(true);
    await expect(call(g, "t2").result).resolves.toBe(true);
    await expect(call(g, "t1").result).rejects.toBeInstanceOf(ConflictException);
  });

  it("gives the key back when the request fails, keeps it when it succeeds", async () => {
    const g = guard();
    const failed = call(g, "t1");
    await failed.result;
    failed.finish(500);
    await new Promise((r) => setImmediate(r));

    const retried = call(g, "t1");
    await expect(retried.result).resolves.toBe(true);
    retried.finish(201);
    await expect(call(g, "t1").result).rejects.toBeInstanceOf(ConflictException);
  });
});

describe("IdempotencyGuard without request.user (auth)", () => {
  const SECRET = "test-secret";
  const config = { redis: { idempotencyTtlSeconds: 60 }, identity: { publicKeys: "", legacySecret: SECRET } } as never;
  const signer = new UserTokenSigner("", SECRET);
  const bearer = (tenantId: string) =>
    `Bearer ${signer.sign({ id: "u1", email: "u@x.co", role: "ENTERPRISE_ADMIN", tenantId }, 60)}`;

  function call(guard: IdempotencyGuard, authorization: string) {
    const response = Object.assign(new EventEmitter(), { statusCode: 201 });
    const request = { method: "POST", originalUrl: "/auth/bundles", headers: { "idempotency-key": "k1", authorization } };
    return guard.canActivate({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    } as never);
  }

  it("scopes the key to the verified bearer's tenant", async () => {
    const g = new IdempotencyGuard({ getAllAndOverride: () => true } as unknown as Reflector, null, config);
    await expect(call(g, bearer("t1"))).resolves.toBe(true);
    await expect(call(g, bearer("t2"))).resolves.toBe(true);
    await expect(call(g, bearer("t1"))).rejects.toBeInstanceOf(ConflictException);
  });

  it("does not take the tenant from an unverified token", async () => {
    const g = new IdempotencyGuard({ getAllAndOverride: () => true } as unknown as Reflector, null, config);
    const forged = new UserTokenSigner("", "other-secret").sign({ id: "u1", email: "u@x.co", role: "ENTERPRISE_ADMIN", tenantId: "t1" }, 60);
    await expect(call(g, `Bearer ${forged}`)).resolves.toBe(true);
    await expect(call(g, bearer("t1"))).resolves.toBe(true);
  });
});
