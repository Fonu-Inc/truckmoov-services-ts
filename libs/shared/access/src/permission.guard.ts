import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { PermissionKey } from "./catalog";
import { PortalGuard } from "./portal.guard";
import {
  CALLER_AUDIENCE,
  PORTALS_KEY,
  routeNotFound,
  type Audience,
  type CallerAudienceResolver,
  type RequestLike,
} from "./portals";
import { REQUIREMENT_KEY, neededPermissions, type Requirement } from "./requirements";

/** The permissions the caller holds right now, or null when none can be found. */
export interface PermissionSource {
  permissionsOf(req: RequestLike): Promise<readonly PermissionKey[] | null>;
}

export const PERMISSION_SOURCE = Symbol("PERMISSION_SOURCE");
export const PERMISSION_ENFORCEMENT = Symbol("PERMISSION_ENFORCEMENT");

/**
 * Every route a user reaches needs a permission, and the user must hold it
 * now. Code checks permissions, never roles. Public routes and routes only
 * services call are outside it: a service is admitted by the route's own
 * list of callers.
 *
 * Runs after the portal rule, and like it only records until enforced.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PERMISSION_SOURCE) private readonly source: PermissionSource,
    @Inject(PortalGuard) private readonly portals: PortalGuard,
    @Inject(CALLER_AUDIENCE) private readonly callers: CallerAudienceResolver,
    @Inject(PERMISSION_ENFORCEMENT) private readonly enforce: boolean,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== "http") return true;
    const audiences = this.reflector.getAllAndOverride<Audience[] | undefined>(PORTALS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!audiences || audiences.includes("public") || audiences.every((a) => a === "service")) return true;

    const req = context.switchToHttp().getRequest<RequestLike & { user?: { service?: string } }>();
    const requirement = this.reflector.getAllAndOverride<Requirement | undefined>(REQUIREMENT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requirement && this.satisfied(neededPermissions(requirement, req.method), await this.source.permissionsOf(req))) {
      return true;
    }

    this.portals.refuse(req, await this.callers.resolve(req), requirement ? "missing_permission" : "undeclared_permission");
    if (this.enforce) throw routeNotFound(req);
    return true;
  }

  private satisfied(needed: PermissionKey[], held: readonly PermissionKey[] | null): boolean {
    if (needed.length === 0) return true;
    return held !== null && needed.every((permission) => held.includes(permission));
  }
}
