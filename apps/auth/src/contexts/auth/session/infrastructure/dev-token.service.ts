import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { AuthUser } from "../domain/entities/auth-user.entity";
import type { TokenService } from "../domain/ports/token-service.port";

@Injectable()
export class DevTokenService implements TokenService {
  private readonly accessTokenToUser = new Map<string, AuthUser>();

  issueAccessToken(user: AuthUser): string {
    const token = `dev-access-${randomUUID()}`;
    this.accessTokenToUser.set(token, user);
    return token;
  }

  issueRefreshToken(_user: AuthUser): string {
    return `dev-refresh-${randomUUID()}`;
  }

  resolveAccessToken(token: string): AuthUser | null {
    return this.accessTokenToUser.get(token) ?? null;
  }
}
