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
    const req = context.switchToHttp().getRequest<{
      ip?: string;
      method?: string;
      route?: { path?: string };
    }>();
    if (!this.limiter.consume(`${resolveClientIp(req)}:${endpointKey(context, req)}`)) {
      throw new HttpException("Too many login attempts, please try again later", HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}

/**
 * One bucket per IP *and* sign-in endpoint. A person who exhausts the
 * enterprise login limit must still be able to open the installer or platform
 * login, and a 2FA screen must not inherit the password step's bucket.
 */
function endpointKey(
  context: ExecutionContext,
  req: { method?: string; route?: { path?: string } },
): string {
  const controller = typeof context.getClass === "function" ? context.getClass().name : "";
  const handler = typeof context.getHandler === "function" ? context.getHandler().name : "";
  const route = req.route?.path ?? "login";
  return [req.method ?? "POST", controller, handler || route].join(".");
}
