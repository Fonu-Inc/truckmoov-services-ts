import { Inject, Injectable, type NestMiddleware } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { UserTokenVerifier, type Portal } from "@shared/identity";
import { normalizeRole } from "@shared/rbac";

export type FleetAuthUser = {
  userId: string;
  email: string;
  role: string;
  tenantId: string;
  portal: Portal;
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

  constructor(@Inject(AppConfigService) config: AppConfigService) {
    this.verifier = new UserTokenVerifier(config.identity.publicKeys, config.identity.legacySecret);
  }

  // Deliberately writes the 401 response directly (res.status().json()) and
  // returns without calling next(), rather than throwing. NestMiddleware in
  // Express mode runs outside Nest's exception-filter pipeline (guards,
  // interceptors, controllers) — a thrown HttpException here is not
  // reliably caught, and was observed to hang requests instead of
  // responding, since Express has no matching error-handling middleware
  // registered to catch it.
  use(req: MutableFleetRequest, res: MiddlewareResponse, next: MiddlewareNext): void {
    const token = this.extractBearerToken(req.headers.authorization);
    if (!token) {
      res.status(401).json({ error: "missing or invalid authorization" });
      return;
    }

    const payload = this.verifier.verify(token);
    if (!payload) {
      res.status(401).json({ error: "missing or invalid authorization" });
      return;
    }

    const role = normalizeRole(payload.role) ?? payload.role;
    req.user = {
      userId: payload.sub,
      email: payload.email,
      role,
      tenantId: payload.tenantId,
      portal: payload.portal,
    };

    req.headers["x-user-role"] = role;
    req.headers["x-tenant-id"] = payload.tenantId;

    next();
  }

  private extractBearerToken(authorizationHeader: string | string[] | undefined): string | null {
    const header = Array.isArray(authorizationHeader)
      ? authorizationHeader[0]
      : authorizationHeader;
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
