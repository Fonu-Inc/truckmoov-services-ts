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
