import { CanActivate, ExecutionContext, Injectable, Inject, HttpException, HttpStatus } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { TokenBucketRateLimiter, resolveClientIp } from "@shared/http";
import { RecordAuthEventUseCase } from "./record-auth-event.use-case";

// Per-IP allowance across many accounts, as a multiple of the per-account one.
const IP_WIDE_FACTOR = 5;

/** The account named in the body, which may be wrapped in `data` (BodyOrDataPipe runs after guards). */
function bodyIdentity(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const wrapped = (body as { data?: unknown }).data;
  const payload = (wrapped && typeof wrapped === "object" ? wrapped : body) as Record<string, unknown>;
  const value = payload.email ?? payload.identifier;
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase().slice(0, 254) : null;
}

@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  private readonly limiter: TokenBucketRateLimiter;
  private readonly ipLimiter: TokenBucketRateLimiter;
  // Last time a rejection was written to the audit log, per IP and endpoint.
  private readonly lastLogged = new Map<string, number>();

  constructor(
    @Inject(AppConfigService) config: AppConfigService,
    @Inject(RecordAuthEventUseCase) private readonly events: RecordAuthEventUseCase,
  ) {
    this.limiter = new TokenBucketRateLimiter(
      config.auth.loginRateLimitRps,
      config.auth.loginRateLimitBurst,
    );
    this.ipLimiter = new TokenBucketRateLimiter(
      config.auth.loginRateLimitRps * IP_WIDE_FACTOR,
      config.auth.loginRateLimitBurst * IP_WIDE_FACTOR,
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      body?: unknown;
      headers?: Record<string, string | string[] | undefined>;
      ip?: string;
      method?: string;
      route?: { path?: string };
    }>();
    const ip = resolveClientIp(req);
    const email = bodyIdentity(req.body);
    const endpoint = endpointKey(context, req);
    // With an account: one bucket per account (any IP) plus a wider per-IP one, so rotating
    // emails from one address or rotating addresses on one account both hit a cap.
    // Without one (2FA, enrolment) the strict bucket is per IP.
    const accountKey = email ? `${endpoint}:${email}` : `${ip}:${endpoint}`;
    const ipKey = `${ip}:${endpoint}`;
    const accountOk = this.limiter.consume(accountKey);
    const ipOk = !email || !accountOk || this.ipLimiter.consume(ipKey);
    if (!accountOk || !ipOk) {
      const retry = Math.max(
        accountOk ? 1 : this.limiter.retryAfter(accountKey),
        ipOk ? 1 : this.ipLimiter.retryAfter(ipKey),
      );
      context.switchToHttp().getResponse?.<{ setHeader?: (n: string, v: string) => void }>()?.setHeader?.("Retry-After", String(retry));
      this.recordRejection(ipKey, email, ip, req.headers?.["user-agent"]);
      throw new HttpException("Too many login attempts, please try again later", HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }

  // At most one audit row per IP and endpoint a minute, so a flood of rejected requests
  // cannot become a flood of database writes.
  private recordRejection(key: string, email: string | null, ip: string, agent: string | string[] | undefined): void {
    const now = Date.now();
    if (now - (this.lastLogged.get(key) ?? 0) < 60_000) return;
    if (this.lastLogged.size >= 10_000) this.lastLogged.clear();
    this.lastLogged.set(key, now);
    void this.events
      .execute({
        tenantId: null,
        userId: null,
        email,
        eventType: "access",
        status: "failed",
        failureReason: "rate_limited",
        ipAddress: ip,
        userAgent: typeof agent === "string" ? agent : null,
      })
      .catch(() => undefined);
  }
}

/**
 * One strict bucket per sign-in endpoint and account, so people sharing an
 * office or carrier address do not spend each other's attempts; a wider per-IP
 * bucket caps one address across accounts. A person who exhausts the
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
