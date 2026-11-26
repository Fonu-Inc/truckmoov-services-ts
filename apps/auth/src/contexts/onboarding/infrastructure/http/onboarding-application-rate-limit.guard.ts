import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { SharedWindowLimit, TokenBucketRateLimiter, resolveClientIp, type EvalRedis } from '@shared/http';
import { REDIS_CLIENT } from '@shared/rbac';

// The application endpoints are unauthenticated by design, so the client IP is
// the only thing left to meter. It is the outer bound only: code sends are
// capped per application, uploads are capped by size and type, and reading an
// application still needs its token.
@Injectable()
export class OnboardingApplicationRateLimitGuard implements CanActivate {
  private readonly limiter: TokenBucketRateLimiter;
  // Cluster-wide cap through Redis, when configured; the bucket stays per pod.
  private readonly shared: SharedWindowLimit | null = null;

  constructor(
    @Inject(AppConfigService) config: AppConfigService,
    @Optional() @Inject(REDIS_CLIENT) redis?: EvalRedis | null,
  ) {
    const { onboardingRateLimitRps: rps, onboardingRateLimitBurst: burst } = config.auth;
    this.limiter = new TokenBucketRateLimiter(rps, burst);
    if (redis) this.shared = new SharedWindowLimit(redis, 'onboarding-ip', Number(burst), Number(rps));
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const http = context.switchToHttp();
    const key = resolveClientIp(http.getRequest<{ ip?: string }>());
    const reject = (retry: number): never => {
      http.getResponse?.<{ setHeader?: (n: string, v: string) => void }>()?.setHeader?.('Retry-After', String(retry));
      throw new HttpException('Too many requests, please try again shortly', HttpStatus.TOO_MANY_REQUESTS);
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
