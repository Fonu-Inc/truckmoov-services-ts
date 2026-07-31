type Bucket = { tokens: number; lastRefill: number };

export class TokenBucketRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly rps: number,
    private readonly burst: number,
  ) {}

  /** Returns true if the request may proceed, false if the bucket is empty. */
  consume(key: string): boolean {
    const now = Date.now();
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
