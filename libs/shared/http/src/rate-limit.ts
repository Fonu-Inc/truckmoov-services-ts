type Bucket = { tokens: number; lastRefill: number };

const SWEEP_THRESHOLD = 10_000;

export class TokenBucketRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private sweepAt = SWEEP_THRESHOLD;

  private readonly rps: number;
  private readonly burst: number;

  // Env values arrive as strings; a NaN here would make every request pass, so refuse to start.
  constructor(rps: number, burst: number) {
    this.rps = Number(rps);
    this.burst = Number(burst);
    if (!Number.isFinite(this.rps) || this.rps < 0 || !Number.isFinite(this.burst) || this.burst < 1) {
      throw new Error(`Invalid rate limit: rps=${rps}, burst=${burst}`);
    }
  }

  /** Returns true if the request may proceed, false if the bucket is empty. */
  consume(key: string): boolean {
    const now = Date.now();
    if (this.buckets.size >= this.sweepAt) this.sweep(now);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.burst, lastRefill: now };
      this.buckets.set(key, bucket);
    }

    // A clock stepping backwards must not drain tokens.
    const elapsed = Math.max(0, now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(this.burst, bucket.tokens + elapsed * this.rps);
    bucket.lastRefill = now;

    if (bucket.tokens < 1) {
      return false;
    }
    bucket.tokens--;
    return true;
  }

  /** Whole seconds until `key` has a token again; 1 if unknown. */
  retryAfter(key: string): number {
    const bucket = this.buckets.get(key);
    if (!bucket || this.rps <= 0) return 1;
    const tokens = Math.min(this.burst, bucket.tokens + ((Date.now() - bucket.lastRefill) / 1000) * this.rps);
    return Math.max(1, Math.ceil((1 - tokens) / this.rps));
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
