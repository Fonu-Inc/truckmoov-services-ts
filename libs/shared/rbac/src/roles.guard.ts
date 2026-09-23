import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AppConfigService } from "@shared/config";
import { normalizeRole } from "./role";
import { ROLES_KEY } from "./roles.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    // Explicit token keeps guard wiring stable even with transpilers that drop metadata.
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Inject(AppConfigService)
    private readonly config: AppConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // Once permissions are enforced they decide, and role checks stand down.
    // Until then this keeps today's protection in place during the log-only
    // period, when the permission rule refuses nothing.
    if (this.config.permissionsEnforced) return true;

    const requiredRoles =
      this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ])?.map((role) => normalizeRole(role) ?? role) ?? [];

    if (requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    // Only request.user (populated exclusively by verified-JWT auth
    // middleware) is trustworthy here. The x-user-role header is
    // client-controlled input and must never be treated as an identity
    // signal, even as a fallback — doing so lets an unauthenticated caller
    // impersonate any role by just setting the header themselves.
    const role = normalizeRole(request.user?.role);

    if (!role) {
      throw new UnauthorizedException("Authentication is required for this route");
    }

    if (requiredRoles.includes(role)) {
      return true;
    }

    throw new ForbiddenException("Insufficient role for this route");
  }
}
