export interface EvalRedis {
  eval(...args: any[]): Promise<unknown>;
}

// Atomic so a crash between the two commands cannot leave a counter without an expiry.
const COUNT = "local n=redis.call('INCR',KEYS[1]) if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end return n";
const TIMEOUT_MS = 200;
const COOLDOWN_MS = 30_000;

/**
 * A fixed-window counter shared by every replica through Redis, so the limit holds across pods
 * and restarts. The window is sized so the long-run rate matches the token bucket (burst / rps).
 * It only adds a cap: on any Redis trouble it lets the request through and the per-pod bucket
 * still applies, and it stays out of the way for a while rather than slowing every request.
 */
export class SharedWindowLimit {
  readonly windowSeconds: number;
  private downUntil = 0;

  constructor(
    private readonly redis: EvalRedis,
    private readonly prefix: string,
    private readonly limit: number,
    rps: number,
  ) {
    this.windowSeconds = rps > 0 ? Math.ceil(limit / rps) : 0;
  }

  /** True when `key` has used up this window's allowance. */
  async exceeded(key: string): Promise<boolean> {
    if (!this.windowSeconds || Date.now() < this.downUntil) return false;
    try {
      const count = await Promise.race([
        this.redis.eval(COUNT, 1, `${this.prefix}:${key}`, this.windowSeconds),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("redis timeout")), TIMEOUT_MS).unref()),
      ]);
      return Number(count) > this.limit;
    } catch {
      this.downUntil = Date.now() + COOLDOWN_MS;
      return false;
    }
  }
}
