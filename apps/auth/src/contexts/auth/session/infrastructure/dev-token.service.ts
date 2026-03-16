import { Inject, Injectable } from "@nestjs/common";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { AppConfigService } from "@shared/config";
import type { AuthUser } from "../domain/entities/auth-user.entity";
import type { TokenService } from "../domain/ports/token-service.port";
import { AuthUser as AuthUserEntity } from "../domain/entities/auth-user.entity";

type AccessTokenPayload = {
  sub: string;
  email: string;
  role: string;
  tenantId: string;
  exp: number;
};

@Injectable()
export class DevTokenService implements TokenService {
  private static readonly ACCESS_TOKEN_TTL_SECONDS = 60 * 60;

  constructor(
    @Inject(AppConfigService)
    private readonly config: AppConfigService,
  ) {}

  issueAccessToken(user: AuthUser): string {
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      exp: nowInSeconds + DevTokenService.ACCESS_TOKEN_TTL_SECONDS,
    };

    return this.sign(payload);
  }

  issueRefreshToken(_user: AuthUser): string {
    return `dev-refresh-${randomUUID()}`;
  }

  resolveAccessToken(token: string): AuthUser | null {
    const payload = this.verify(token);
    if (!payload) {
      return null;
    }

    return AuthUserEntity.create({
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      tenantId: payload.tenantId,
    });
  }

  revokeAccessToken(_token: string): void {}

  private sign(payload: AccessTokenPayload): string {
    const encodedPayload = this.encode(payload);
    const signature = this.signValue(encodedPayload);
    return `${encodedPayload}.${signature}`;
  }

  private verify(token: string): AccessTokenPayload | null {
    const [encodedPayload, signature] = token.split(".");
    if (!encodedPayload || !signature) {
      return null;
    }

    const expectedSignature = this.signValue(encodedPayload);
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

  private encode(payload: AccessTokenPayload): string {
    return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  }

  private signValue(value: string): string {
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
