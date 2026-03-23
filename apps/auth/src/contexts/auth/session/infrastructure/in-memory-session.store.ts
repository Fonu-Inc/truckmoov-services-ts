import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../domain/entities/auth-user.entity";
import type {
  SessionStore,
  UserSessionActivity,
} from "../domain/ports/session-store.port";

@Injectable()
export class InMemorySessionStore implements SessionStore {
  private readonly refreshToUser = new Map<string, {
    user: AuthUser;
    updatedAt: Date;
  }>();

  async save(refreshToken: string, user: AuthUser): Promise<void> {
    this.refreshToUser.set(refreshToken, {
      user,
      updatedAt: new Date(),
    });
  }

  async getByRefreshToken(refreshToken: string): Promise<AuthUser | null> {
    return this.refreshToUser.get(refreshToken)?.user ?? null;
  }

  async deleteByRefreshToken(refreshToken: string): Promise<void> {
    this.refreshToUser.delete(refreshToken);
  }

  async deleteAllForUser(userId: string): Promise<void> {
    for (const [token, session] of this.refreshToUser.entries()) {
      if (session.user.id === userId) this.refreshToUser.delete(token);
    }
  }

  async listUserActivity(userIds: string[]): Promise<UserSessionActivity[]> {
    const summary = new Map<string, UserSessionActivity>();

    for (const session of this.refreshToUser.values()) {
      if (!userIds.includes(session.user.id)) {
        continue;
      }

      const existing = summary.get(session.user.id);
      if (!existing || (existing.lastActiveAt?.getTime() ?? 0) < session.updatedAt.getTime()) {
        summary.set(session.user.id, {
          userId: session.user.id,
          hasActiveSession: true,
          lastActiveAt: session.updatedAt,
        });
      }
    }

    return [...summary.values()];
  }
}
