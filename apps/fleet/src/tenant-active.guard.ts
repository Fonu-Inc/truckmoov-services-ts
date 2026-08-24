import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { SKIP_TENANT_KEY } from "./tenant.guard";
import { TenantStatusService } from "./tenant-status.service";

/**
 * Refuses every request from a suspended tenant, read or write.
 *
 * Suspension is a total lockout: auth already refuses a suspended tenant on
 * every one of its own endpoints, because it re-reads the user each request.
 * Fleet verifies the token locally and cannot see that, so without this guard a
 * token issued before the suspension keeps working here until it expires.
 */
@Injectable()
export class TenantActiveGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(TenantStatusService) private readonly tenantStatus: TenantStatusService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_TENANT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: { tenantId?: string };
    }>();

    const tenantId = req.user?.tenantId;
    // No authenticated tenant means the auth middleware already rejected the
    // request or the route is unauthenticated. Nothing to check either way.
    if (!tenantId) return true;

    const accessToken = this.bearerToken(req.headers.authorization);
    if (!accessToken) return true;

    if (!(await this.tenantStatus.isActive(tenantId, accessToken))) {
      throw new ForbiddenException("This organisation is suspended");
    }

    return true;
  }

  private bearerToken(header: string | string[] | undefined): string | null {
    const value = Array.isArray(header) ? header[0] : header;
    if (!value) return null;
    const [scheme, token] = value.split(" ");
    return scheme?.toLowerCase() === "bearer" && token ? token : null;
  }
}
