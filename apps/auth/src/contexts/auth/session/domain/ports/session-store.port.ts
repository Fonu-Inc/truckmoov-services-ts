import type { AuthUser } from "../entities/auth-user.entity";

export type UserSessionActivity = {
  userId: string;
  hasActiveSession: boolean;
  lastActiveAt: Date | null;
};

export interface SessionStore {
  /** Starts a session: a new family of refresh tokens. */
  save(refreshToken: string, user: AuthUser): Promise<void>;
  /** The session's user; null for a token unknown, revoked or already spent. */
  getByRefreshToken(refreshToken: string): Promise<AuthUser | null>;
  /**
   * Spends oldToken and continues its session under newToken. The spent token
   * is kept, so presenting it again is recognised as reuse.
   */
  rotate(oldToken: string, newToken: string, user: AuthUser): Promise<void>;
  /** Whether this token was valid once and has since been rotated away. */
  isSpent(refreshToken: string): Promise<boolean>;
  /** Ends the whole session the token belongs to, every token of it. */
  revokeFamily(refreshToken: string): Promise<void>;
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
