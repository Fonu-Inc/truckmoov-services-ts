import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PUBLIC_ROUTE_KEY } from "@shared/rbac";
import {
  CALLER_AUDIENCE,
  PORTAL_ENFORCEMENT,
  PORTALS_KEY,
  REFUSAL_REPORTER,
  clientIp,
  routeNotFound,
  type Audience,
  type Caller,
  type CallerAudienceResolver,
  type Refusal,
  type RefusalReporter,
  type RequestLike,
} from "./portals";

/**
 * The one rule every route passes through: it must say who it serves, and
 * the caller must be one of them. Anything else answers as a missing route.
 *
 * Until enforcement is switched on it refuses nothing, and only records what
 * it would have refused, so a caller the declarations missed shows up in the
 * logs instead of breaking.
 */
@Injectable()
export class PortalGuard implements CanActivate {
  private readonly logger = new Logger(PortalGuard.name);

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(CALLER_AUDIENCE) private readonly callers: CallerAudienceResolver,
    @Inject(REFUSAL_REPORTER) private readonly reporter: RefusalReporter,
    @Inject(PORTAL_ENFORCEMENT) private readonly enforce: boolean,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== "http") return true;
    const req = context.switchToHttp().getRequest<RequestLike>();
    const audiences = this.audiencesFor(context);
    if (audiences?.includes("public")) return true;

    const caller = await this.callers.resolve(req);
    if (caller !== "unverified" && audiences?.includes(caller)) return true;
    // 401 is what tells a portal to refresh an expired token; answering it
    // with 404 would sign the user out instead.
    if (caller === "unverified" && this.enforce) {
      throw new UnauthorizedException("missing or invalid authorization");
    }

    this.refuse(req, caller, audiences ? "audience_not_served" : "undeclared_route");
    if (this.enforce) throw routeNotFound(req);
    return true;
  }

  refuse(req: RequestLike, caller: Caller, reason: Refusal["reason"]): void {
    const refusal: Refusal = { method: req.method, path: req.originalUrl ?? req.url ?? "", ip: clientIp(req), caller, reason };
    this.logger.warn(
      `route_refused:${refusal.reason}:${refusal.method} ${refusal.path}:caller=${caller}:ip=${refusal.ip}:enforced=${this.enforce}`,
    );
    // Only real refusals count toward IP blocking: while enforcement is off, a
    // gap in the declarations would otherwise block legitimate users.
    if (this.enforce) this.reporter.report(refusal);
  }

  private audiencesFor(context: ExecutionContext): Audience[] | undefined {
    const declared = this.reflector.getAllAndOverride<Audience[] | undefined>(PORTALS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (declared) return declared;
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [context.getHandler(), context.getClass()]);
    return isPublic ? ["public"] : undefined;
  }
}
