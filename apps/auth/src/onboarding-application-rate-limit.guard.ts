import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { TokenBucketRateLimiter, resolveClientIp } from '@shared/http';

// The application endpoints are unauthenticated by design, so the client IP is
// the only thing left to meter. It is the outer bound only: code sends are
// capped per application, uploads are capped by size and type, and reading an
// application still needs its token.
@Injectable()
export class OnboardingApplicationRateLimitGuard implements CanActivate {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(@Inject(AppConfigService) config: AppConfigService) {
    this.limiter = new TokenBucketRateLimiter(
      config.auth.onboardingRateLimitRps,
      config.auth.onboardingRateLimitBurst,
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ ip?: string }>();
    if (!this.limiter.consume(resolveClientIp(req))) {
      throw new HttpException(
        'Too many requests, please try again shortly',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
