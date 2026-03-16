import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

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
      query: Record<string, string | undefined>;
      body: Record<string, string | undefined>;
    }>();

    const claimedTenant = req.headers["x-tenant-id"];
    if (!claimedTenant) return true; // No tenant header → single-tenant / unauthenticated dev mode

    const role = req.headers["x-user-role"];
    if (role === "admin") return true; // Admins can access any tenant

    const requested =
      req.query["tenantId"] ??
      req.query["tenant_id"] ??
      req.body?.["tenantId"] ??
      req.body?.["tenant_id"];

    if (requested && requested !== claimedTenant) {
      throw new ForbiddenException(`Tenant mismatch: you may only access your own tenant`);
    }

    return true;
  }
}
