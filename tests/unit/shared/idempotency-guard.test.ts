import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { ConflictException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IdempotencyGuard } from "@shared/rbac";

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
