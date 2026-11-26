import { CanActivate, ExecutionContext, Injectable, Inject, Optional, HttpException, HttpStatus } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { SharedWindowLimit, TokenBucketRateLimiter, resolveClientIp, type EvalRedis } from "@shared/http";
import { REDIS_CLIENT } from "@shared/rbac";

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly limiter: TokenBucketRateLimiter;
  // Cluster-wide cap through Redis, when configured; the bucket stays per pod.
  private readonly shared: SharedWindowLimit | null = null;

  constructor(
    @Inject(AppConfigService) config: AppConfigService,
    @Optional() @Inject(REDIS_CLIENT) redis?: EvalRedis | null,
  ) {
    this.limiter = new TokenBucketRateLimiter(config.fleet.rateLimitRps, config.fleet.rateLimitBurst);
    if (redis) {
      this.shared = new SharedWindowLimit(redis, "fleet-ip", Number(config.fleet.rateLimitBurst), Number(config.fleet.rateLimitRps));
    }
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const http = context.switchToHttp();
    const key = resolveClientIp(http.getRequest<{ ip?: string }>());
    const reject = (retry: number): never => {
      http.getResponse?.<{ setHeader?: (n: string, v: string) => void }>()?.setHeader?.("Retry-After", String(retry));
      throw new HttpException("Rate limit exceeded", HttpStatus.TOO_MANY_REQUESTS);
    };
    if (!this.limiter.consume(key)) reject(this.limiter.retryAfter(key));
    const shared = this.shared;
    if (!shared) return true;
    return shared.exceeded(key).then((over) => {
      if (over) reject(shared.windowSeconds);
      return true;
    });
  }
}
