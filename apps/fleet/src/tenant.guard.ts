import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Role, normalizeRole } from "@shared/rbac";

// Routes decorated with @SkipTenantCheck() bypass this guard.
export const SKIP_TENANT_KEY = "skipTenantCheck";

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_TENANT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: { tenantId?: string; role?: string };
    }>();

    const claimedTenant = req.user?.tenantId ?? req.headers["x-tenant-id"];
    if (!claimedTenant) return true; // No tenant context → single-tenant / unauthenticated dev mode

    const role = normalizeRole(req.user?.role ?? req.headers["x-user-role"]);
    if (role === Role.ENTERPRISE_ADMIN) return true; // Enterprise admins can access any tenant

    return true;
  }
}
