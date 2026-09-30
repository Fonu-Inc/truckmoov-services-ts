import { Inject, Injectable, type NestMiddleware } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import {
  ACTING_FOR_TENANT_HEADER,
  SERVICE_TOKEN_HEADER,
  SYSTEM_TENANT_ID,
  UserTokenVerifier,
  portalFor,
  type Portal,
  type ServiceTokenVerifier,
  createServiceTokenVerifier,
} from "@shared/identity";
import { Role, normalizeRole } from "@shared/rbac";
import { AccessClient, type PermissionKey } from "@shared/access";

export type FleetAuthUser = {
  userId: string;
  email: string;
  role: string;
  tenantId: string;
  portal: Portal;
  /** The calling service, when the request is a service call. */
  service?: string;
  /** What the user may do right now, from auth; absent when auth could not be asked. */
  permissions?: PermissionKey[];
  /**
   * The kind of organisation the user belongs to, from auth; absent when auth
   * could not be asked. Anything that depends on it treats absent as unknown.
   */
  organizationType?: string | null;
};

/**
 * What each calling service acts as here, inside the tenant it acts for. The
 * receiver decides this; callers no longer mint a token naming a role.
 * Only auth may act for no tenant, which is how it reaches the cross-tenant
 * platform routes.
 */
const SERVICE_ROLES: Record<string, { inTenant: Role; platform?: Role }> = {
  auth: { inTenant: Role.FLEET_ADMIN, platform: Role.PLATFORM_ADMIN },
  dispatch: { inTenant: Role.FLEET_ADMIN },
  notification: { inTenant: Role.DISPATCHER },
};

type MutableFleetRequest = {
  headers: Record<string, string | string[] | undefined>;
  user?: FleetAuthUser;
};

type MiddlewareResponse = {
  status(code: number): { json(body: unknown): void };
};

type MiddlewareNext = (error?: unknown) => void;

@Injectable()
export class AuthContextMiddleware implements NestMiddleware {
  private readonly verifier: UserTokenVerifier;
  private readonly services: ServiceTokenVerifier;

  constructor(
    @Inject(AppConfigService) config: AppConfigService,
    @Inject(AccessClient) private readonly access: AccessClient,
  ) {
    this.verifier = new UserTokenVerifier(config.identity.publicKeys, config.identity.legacySecret);
    this.services = createServiceTokenVerifier(config, "fleet");
  }

  // Deliberately writes the 401 response directly (res.status().json()) and
  // returns without calling next(), rather than throwing. NestMiddleware in
  // Express mode runs outside Nest's exception-filter pipeline (guards,
  // interceptors, controllers) — a thrown HttpException here is not
  // reliably caught, and was observed to hang requests instead of
  // responding, since Express has no matching error-handling middleware
  // registered to catch it.
  async use(req: MutableFleetRequest, res: MiddlewareResponse, next: MiddlewareNext): Promise<void> {
    const user = (await this.serviceCaller(req.headers)) ?? (await this.currentUser(req.headers.authorization));
    if (!user) {
      res.status(401).json({ error: "missing or invalid authorization" });
      return;
    }

    req.user = user;
    req.headers["x-user-role"] = user.role;
    req.headers["x-tenant-id"] = user.tenantId;

    next();
  }

  /**
   * The token proves who the user is; auth says whether they still may act.
   * A suspended or deleted account is refused here on its next request. When
   * auth cannot be asked, the verified token stands, rather than refusing
   * everyone while auth is down.
   */
  private async currentUser(authorization: string | string[] | undefined): Promise<FleetAuthUser | null> {
    const user = this.userFromToken(authorization);
    if (!user) return null;
    const access = await this.access.get(user.userId);
    if (access === null || access?.active === false) return null;
    return access ? { ...user, permissions: access.permissions, organizationType: access.organizationType ?? null } : user;
  }

  private userFromToken(authorization: string | string[] | undefined): FleetAuthUser | null {
    const payload = this.verifier.verify(this.extractBearerToken(authorization) ?? undefined);
    if (!payload) return null;
    return {
      userId: payload.sub,
      email: payload.email,
      role: normalizeRole(payload.role) ?? payload.role,
      tenantId: payload.tenantId,
      portal: payload.portal,
    };
  }

  private async serviceCaller(headers: MutableFleetRequest["headers"]): Promise<FleetAuthUser | null> {
    const service = await this.services.verify(single(headers[SERVICE_TOKEN_HEADER]));
    const grant = service ? SERVICE_ROLES[service] : undefined;
    if (!service || !grant) return null;

    const actingFor = single(headers[ACTING_FOR_TENANT_HEADER])?.trim();
    const role = actingFor ? grant.inTenant : grant.platform;
    const tenantId = actingFor || SYSTEM_TENANT_ID;
    if (!role) return null;

    return {
      userId: `service:${service}`,
      email: `${service}-service@truckmoov.local`,
      role,
      tenantId,
      portal: portalFor({ role, tenantId }),
      service,
    };
  }

  private extractBearerToken(authorizationHeader: string | string[] | undefined): string | null {
    const header = single(authorizationHeader);
    if (!header) {
      return null;
    }

    const [scheme, token] = header.split(" ");
    if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
      return null;
    }

    return token.trim() || null;
  }
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
