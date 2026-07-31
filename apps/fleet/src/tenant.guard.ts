import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
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
      query: Record<string, string | undefined>;
      body: Record<string, unknown> | undefined;
      user?: { tenantId?: string; role?: string };
    }>();

    // Only req.user (populated exclusively by verified-JWT auth middleware)
    // is trustworthy — never the x-tenant-id/x-user-role headers, which are
    // client-controlled input.
    const authenticatedTenant = req.user?.tenantId;
    if (!authenticatedTenant) return true; // No authenticated tenant context → nothing to enforce here.

    const role = normalizeRole(req.user?.role);
    if (role === Role.ENTERPRISE_ADMIN || role === Role.SUPER_ADMIN) return true;

    const queryTenantId = req.query?.["tenantId"];
    const bodyTenantId = typeof req.body?.["tenantId"] === "string" ? (req.body["tenantId"] as string) : undefined;

    if (
      (queryTenantId && queryTenantId !== authenticatedTenant)
      || (bodyTenantId && bodyTenantId !== authenticatedTenant)
    ) {
      throw new ForbiddenException("tenant_id must match the authenticated tenant");
    }

    return true;
  }
}
