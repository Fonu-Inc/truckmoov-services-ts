import type { AuthUser } from "../entities/auth-user.entity";

export interface TokenService {
  issueAccessToken(user: AuthUser): string;
  issueRefreshToken(user: AuthUser): string;
  resolveAccessToken(token: string): AuthUser | null;
}

export const TOKEN_SERVICE = Symbol("TOKEN_SERVICE");
