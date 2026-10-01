import { CanActivate, ExecutionContext, Injectable, NotFoundException } from "@nestjs/common";
import { isPlatformActor } from "@shared/identity";

type RequestWithActor = { user?: { role?: string; tenantId?: string; service?: string } };

const TRACKING_SERVICE = "tracking";

/** Role alone is not enough: these routes take the target tenant from the URL. */
@Injectable()
export class PlatformActorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<RequestWithActor>().user;
    if (user?.service === TRACKING_SERVICE) throw new NotFoundException();
    if (user?.role && user.tenantId && isPlatformActor({ role: user.role, tenantId: user.tenantId })) {
      return true;
    }
    throw new NotFoundException();
  }
}

/** The platform's own routes, plus the one read the tracking service needs to gate ingest. */
@Injectable()
export class PlatformOrTrackingGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<RequestWithActor>().user;
    if (user?.service === TRACKING_SERVICE) return true;
    return new PlatformActorGuard().canActivate(context);
  }
}
