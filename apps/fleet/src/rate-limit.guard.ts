import { CanActivate, ExecutionContext, Injectable, Inject, HttpException, HttpStatus } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { TokenBucketRateLimiter, resolveClientIp } from "@shared/http";

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(@Inject(AppConfigService) config: AppConfigService) {
    this.limiter = new TokenBucketRateLimiter(config.fleet.rateLimitRps, config.fleet.rateLimitBurst);
  }

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const key = resolveClientIp(http.getRequest<{ ip?: string }>());
    if (!this.limiter.consume(key)) {
      http.getResponse?.<{ setHeader?: (n: string, v: string) => void }>()?.setHeader?.("Retry-After", String(this.limiter.retryAfter(key)));
      throw new HttpException("Rate limit exceeded", HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
