export class TokenBucket {
  private tokens: number;
  private refilledAt: number;

  constructor(
    private readonly capacity: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = capacity;
    this.refilledAt = now();
  }

  take(): boolean {
    this.refill();
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }

  private refill(): void {
    const at = this.now();
    const gained = ((at - this.refilledAt) / this.windowMs) * this.capacity;
    this.tokens = Math.min(this.capacity, this.tokens + gained);
    this.refilledAt = at;
  }
}
