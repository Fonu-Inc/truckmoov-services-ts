import type { AuthUser } from "../entities/auth-user.entity";

export type UserSessionActivity = {
  userId: string;
  hasActiveSession: boolean;
  lastActiveAt: Date | null;
};

export interface SessionStore {
  save(refreshToken: string, user: AuthUser): Promise<void>;
  getByRefreshToken(refreshToken: string): Promise<AuthUser | null>;
  /**
   * When this session was last used. Refresh rotates the token, so this is the
   * moment of the previous refresh and therefore how long it has been idle.
   */
  lastActiveAt(refreshToken: string): Promise<Date | null>;
  deleteByRefreshToken(refreshToken: string): Promise<void>;
  deleteAllForUser(userId: string): Promise<void>;
  listUserActivity(userIds: string[]): Promise<UserSessionActivity[]>;
}

export const SESSION_STORE = Symbol("SESSION_STORE");
