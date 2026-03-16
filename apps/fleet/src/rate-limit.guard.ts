import { CanActivate, ExecutionContext, Injectable, Inject, HttpException, HttpStatus } from "@nestjs/common";
import { AppConfigService } from "@shared/config";

type Bucket = { tokens: number; lastRefill: number };

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();
  private readonly rps: number;
  private readonly burst: number;

  constructor(@Inject(AppConfigService) config: AppConfigService) {
    this.rps = config.fleet.rateLimitRps;
    this.burst = config.fleet.rateLimitBurst;
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ ip?: string; headers: Record<string, string> }>();
    const ip = req.headers["x-forwarded-for"] ?? req.ip ?? "unknown";
    const now = Date.now();

    let bucket = this.buckets.get(ip);
    if (!bucket) {
      bucket = { tokens: this.burst, lastRefill: now };
      this.buckets.set(ip, bucket);
    }

    const elapsed = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(this.burst, bucket.tokens + elapsed * this.rps);
    bucket.lastRefill = now;

    if (bucket.tokens < 1) {
      throw new HttpException("Rate limit exceeded", HttpStatus.TOO_MANY_REQUESTS);
    }

    bucket.tokens--;
    return true;
  }
}
