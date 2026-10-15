type Bucket = { tokens: number; lastRefill: number };

const SWEEP_THRESHOLD = 10_000;

export class TokenBucketRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private sweepAt = SWEEP_THRESHOLD;

  constructor(
    private readonly rps: number,
    private readonly burst: number,
  ) {}

  /** Returns true if the request may proceed, false if the bucket is empty. */
  consume(key: string): boolean {
    const now = Date.now();
    if (this.buckets.size >= this.sweepAt) this.sweep(now);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.burst, lastRefill: now };
      this.buckets.set(key, bucket);
    }

    const elapsed = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(this.burst, bucket.tokens + elapsed * this.rps);
    bucket.lastRefill = now;

    if (bucket.tokens < 1) {
      return false;
    }
    bucket.tokens--;
    return true;
  }

  // A bucket that has refilled is the same as no bucket, so dropping it loses nothing.
  // The next sweep waits until the map doubles, keeping the cost amortised.
  private sweep(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.tokens + ((now - bucket.lastRefill) / 1000) * this.rps >= this.burst) this.buckets.delete(key);
    }
    this.sweepAt = Math.max(SWEEP_THRESHOLD, this.buckets.size * 2);
  }
}

/**
 * Resolves the rate-limit key from the raw socket peer address only.
 * Deliberately ignores X-Forwarded-For: that header is client-controlled
 * input unless the app explicitly configures Express `trust proxy` (which
 * makes req.ip parse it from trusted hops only) — trusting it directly lets
 * a caller set a different value on every request and bypass the limit
 * entirely.
 */
export function resolveClientIp(req: { ip?: string }): string {
  return req.ip ?? "unknown";
}
