import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Role, normalizeRole } from "./role";
import { ROLES_KEY } from "./roles.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    // Explicit token keeps guard wiring stable even with transpilers that drop metadata.
    @Inject(Reflector)
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles =
      this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ])?.map((role) => normalizeRole(role) ?? role) ?? [];

    if (requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const roleHeader = request.headers["x-user-role"];
    const roleFromUser = request.user?.role;
    const role = normalizeRole(
      roleFromUser ?? (Array.isArray(roleHeader) ? roleHeader[0] : roleHeader),
    );

    if (!role) {
      throw new UnauthorizedException("Authentication is required for this route");
    }

    if (role === Role.SUPER_ADMIN) {
      return true;
    }

    if (requiredRoles.includes(role)) {
      return true;
    }

    throw new ForbiddenException("Insufficient role for this route");
  }
}
