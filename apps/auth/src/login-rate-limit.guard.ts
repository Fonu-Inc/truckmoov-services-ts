import { CanActivate, ExecutionContext, Injectable, Inject, HttpException, HttpStatus } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { TokenBucketRateLimiter, resolveClientIp } from "@shared/http";
import { RecordAuthEventUseCase } from "./record-auth-event.use-case";

@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(
    @Inject(AppConfigService) config: AppConfigService,
    @Inject(RecordAuthEventUseCase) private readonly events: RecordAuthEventUseCase,
  ) {
    this.limiter = new TokenBucketRateLimiter(
      config.auth.loginRateLimitRps,
      config.auth.loginRateLimitBurst,
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      body?: { email?: unknown };
      headers?: Record<string, string | string[] | undefined>;
      ip?: string;
      method?: string;
      route?: { path?: string };
    }>();
    const ip = resolveClientIp(req);
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase().slice(0, 254) : null;
    if (!this.limiter.consume(`${ip}:${endpointKey(context, req)}:${email ?? ""}`)) {
      const agent = req.headers?.["user-agent"];
      void this.events.execute({
        tenantId: null,
        userId: null,
        email,
        eventType: "access",
        status: "failed",
        failureReason: "rate_limited",
        ipAddress: ip,
        userAgent: typeof agent === "string" ? agent : null,
      });
      throw new HttpException("Too many login attempts, please try again later", HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}

/**
 * One bucket per IP, sign-in endpoint and account, so people sharing an
 * office or carrier address do not spend each other's attempts; the gateway's
 * per-IP limit and the failed-login block still cap one address. A person who exhausts the
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
