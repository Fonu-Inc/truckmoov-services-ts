import { CanActivate, ExecutionContext, Injectable, Inject, HttpException, HttpStatus } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { TokenBucketRateLimiter, resolveClientIp } from "@shared/http";

@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(@Inject(AppConfigService) config: AppConfigService) {
    this.limiter = new TokenBucketRateLimiter(
      config.auth.loginRateLimitRps,
      config.auth.loginRateLimitBurst,
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ ip?: string }>();
    if (!this.limiter.consume(resolveClientIp(req))) {
      throw new HttpException("Too many login attempts, please try again later", HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
