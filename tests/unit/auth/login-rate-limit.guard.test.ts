import { describe, expect, it } from "vitest";
import { HttpException, HttpStatus } from "@nestjs/common";
import { type AppConfigService } from "@shared/config";
import { LoginRateLimitGuard } from "../../../apps/auth/src/login-rate-limit.guard";

function makeGuard(rps = 1, burst = 3): LoginRateLimitGuard {
  const config = { auth: { loginRateLimitRps: rps, loginRateLimitBurst: burst } } as AppConfigService;
  return new LoginRateLimitGuard(config);
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

describe("LoginRateLimitGuard", () => {
  it("allows requests within burst", () => {
    const guard = makeGuard(1, 3);
    const ctx = makeCtx("10.0.0.1");
    for (let i = 0; i < 3; i++) {
      expect(guard.canActivate(ctx)).toBe(true);
    }
  });

  it("throws 429 after burst exhausted", () => {
    const guard = makeGuard(0.1, 3);
    const ctx = makeCtx("10.0.0.2");
    for (let i = 0; i < 3; i++) guard.canActivate(ctx);
    expect(() => guard.canActivate(ctx)).toThrow(HttpException);
    expect(() => guard.canActivate(ctx)).toThrow(
      expect.objectContaining({ status: HttpStatus.TOO_MANY_REQUESTS }),
    );
  });

  it("ignores a client-supplied x-forwarded-for header and buckets by req.ip", () => {
    const guard = makeGuard(0.1, 2);
    guard.canActivate(makeCtx("127.0.0.1", "5.5.5.5"));
    guard.canActivate(makeCtx("127.0.0.1", "6.6.6.6"));
    expect(() => guard.canActivate(makeCtx("127.0.0.1", "7.7.7.7"))).toThrow(HttpException);
  });

  it("separate buckets per IP", () => {
    const guard = makeGuard(0.1, 1);
    guard.canActivate(makeCtx("10.0.0.3"));
    expect(guard.canActivate(makeCtx("10.0.0.4"))).toBe(true);
  });
});
