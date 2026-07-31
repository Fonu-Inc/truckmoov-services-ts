import { describe, expect, it, vi, afterEach } from "vitest";
import { HttpException, HttpStatus } from "@nestjs/common";
import { type AppConfigService } from "@shared/config";
import { RateLimitGuard } from "../../../apps/fleet/src/rate-limit.guard";

function makeGuard(rps = 10, burst = 5): RateLimitGuard {
  const config = { fleet: { rateLimitRps: rps, rateLimitBurst: burst } } as AppConfigService;
  return new RateLimitGuard(config);
}

function makeCtx(ip = "1.2.3.4", forwardedFor?: string) {
  const headers: Record<string, string> = {};
  if (forwardedFor) headers["x-forwarded-for"] = forwardedFor;
  return {
    switchToHttp: () => ({
      getRequest: () => ({ ip, headers }),
    }),
  } as any;
}

describe("RateLimitGuard", () => {
  afterEach(() => vi.useRealTimers());

  it("allows requests within burst", () => {
    const guard = makeGuard(10, 5);
    const ctx = makeCtx("10.0.0.1");
    for (let i = 0; i < 5; i++) {
      expect(guard.canActivate(ctx)).toBe(true);
    }
  });

  it("throws 429 after burst exhausted", () => {
    const guard = makeGuard(1, 3);
    const ctx = makeCtx("10.0.0.2");
    for (let i = 0; i < 3; i++) guard.canActivate(ctx);
    expect(() => guard.canActivate(ctx)).toThrow(HttpException);
    expect(() => guard.canActivate(ctx)).toThrow(
      expect.objectContaining({ status: HttpStatus.TOO_MANY_REQUESTS }),
    );
  });

  it("ignores a client-supplied x-forwarded-for header and buckets by req.ip", () => {
    // x-forwarded-for is client-controlled input — trusting it lets a caller
    // set a different value on every request and bypass the limit entirely.
    // Two different spoofed headers on the same underlying req.ip must share
    // one bucket.
    const guard = makeGuard(10, 2);
    guard.canActivate(makeCtx("127.0.0.1", "5.5.5.5"));
    guard.canActivate(makeCtx("127.0.0.1", "6.6.6.6"));
    expect(() => guard.canActivate(makeCtx("127.0.0.1", "7.7.7.7"))).toThrow(HttpException);
  });

  it("separate buckets per IP", () => {
    const guard = makeGuard(1, 1);
    guard.canActivate(makeCtx("10.0.0.3"));
    expect(guard.canActivate(makeCtx("10.0.0.4"))).toBe(true);
  });

  it("tokens refill over time", () => {
    vi.useFakeTimers();
    const guard = makeGuard(10, 2);
    const ctx = makeCtx("10.0.0.5");
    guard.canActivate(ctx);
    guard.canActivate(ctx);
    vi.advanceTimersByTime(1000);
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
