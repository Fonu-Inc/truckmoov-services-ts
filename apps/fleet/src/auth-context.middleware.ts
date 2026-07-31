import { Inject, Injectable, type NestMiddleware } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { normalizeRole } from "@shared/rbac";
import { createHmac, timingSafeEqual } from "node:crypto";

type AccessTokenPayload = {
  sub: string;
  email: string;
  role: string;
  tenantId: string;
  exp: number;
};

export type FleetAuthUser = {
  userId: string;
  email: string;
  role: string;
  tenantId: string;
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
  constructor(
    @Inject(AppConfigService)
    private readonly config: AppConfigService,
  ) {}

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

    const payload = this.verify(token);
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

  private verify(token: string): AccessTokenPayload | null {
    const [encodedPayload, signature] = token.split(".");
    if (!encodedPayload || !signature) {
      return null;
    }

    const expectedSignature = this.sign(encodedPayload);
    if (!this.safeEquals(signature, expectedSignature)) {
      return null;
    }

    let payload: AccessTokenPayload;
    try {
      payload = JSON.parse(
        Buffer.from(encodedPayload, "base64url").toString("utf8"),
      ) as AccessTokenPayload;
    } catch {
      return null;
    }

    if (
      typeof payload.sub !== "string"
      || typeof payload.email !== "string"
      || typeof payload.role !== "string"
      || typeof payload.tenantId !== "string"
      || typeof payload.exp !== "number"
    ) {
      return null;
    }

    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  }

  private sign(value: string): string {
    return createHmac("sha256", this.config.auth.jwtSecret)
      .update(value)
      .digest("base64url");
  }

  private safeEquals(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, "utf8");
    const rightBuffer = Buffer.from(right, "utf8");
    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }

    return timingSafeEqual(leftBuffer, rightBuffer);
  }
}
