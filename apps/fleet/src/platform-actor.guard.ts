import { CanActivate, ExecutionContext, Injectable, NotFoundException } from "@nestjs/common";
import { isPlatformActor } from "@shared/identity";

type RequestWithActor = { user?: { role?: string; tenantId?: string } };

/** Role alone is not enough: these routes take the target tenant from the URL. */
@Injectable()
export class PlatformActorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<RequestWithActor>().user;
    if (user?.role && user.tenantId && isPlatformActor({ role: user.role, tenantId: user.tenantId })) {
      return true;
    }
    throw new NotFoundException();
  }
}
