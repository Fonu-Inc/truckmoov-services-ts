import { afterEach, describe, expect, it, vi } from "vitest";
import { TokenBucketRateLimiter } from "@shared/http";

afterEach(() => vi.useRealTimers());

describe("TokenBucketRateLimiter", () => {
  it("drops refilled buckets instead of growing forever", () => {
    vi.useFakeTimers();
    const limiter = new TokenBucketRateLimiter(1, 1);
    for (let i = 0; i < 10_000; i++) limiter.consume(`ip-${i}`);

    vi.advanceTimersByTime(2_000);
    expect(limiter.consume("fresh")).toBe(true);

    expect((limiter as unknown as { buckets: Map<string, unknown> }).buckets.size).toBe(1);
  });
});

describe("TokenBucketRateLimiter config", () => {
  it("refuses NaN or non-positive burst instead of failing open", () => {
    expect(() => new TokenBucketRateLimiter(Number("abc"), 10)).toThrow();
    expect(() => new TokenBucketRateLimiter(1, 0)).toThrow();
  });

  it("does not lose tokens when the clock steps back", () => {
    vi.useFakeTimers();
    const limiter = new TokenBucketRateLimiter(1, 2);
    limiter.consume("k");
    vi.setSystemTime(Date.now() - 60_000);
    expect(limiter.consume("k")).toBe(true);
  });
});
