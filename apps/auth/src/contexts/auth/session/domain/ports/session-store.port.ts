import type { AuthUser } from "../entities/auth-user.entity";

export interface SessionStore {
  save(refreshToken: string, user: AuthUser): Promise<void>;
  getByRefreshToken(refreshToken: string): Promise<AuthUser | null>;
}

export const SESSION_STORE = Symbol("SESSION_STORE");
