import { randomUUID } from "node:crypto";
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
    familyId: string;
    spent: boolean;
  }>();

  async save(refreshToken: string, user: AuthUser): Promise<void> {
    this.refreshToUser.set(refreshToken, { user, updatedAt: new Date(), familyId: randomUUID(), spent: false });
  }

  async getByRefreshToken(refreshToken: string): Promise<AuthUser | null> {
    const session = this.refreshToUser.get(refreshToken);
    return session && !session.spent ? session.user : null;
  }

  async rotate(oldToken: string, newToken: string, user: AuthUser): Promise<boolean> {
    const old = this.refreshToUser.get(oldToken);
    if (!old || old.spent) return false;
    this.refreshToUser.set(oldToken, { ...old, spent: true });
    this.refreshToUser.set(newToken, { user, updatedAt: new Date(), familyId: old.familyId, spent: false });
    return true;
  }

  async isSpent(refreshToken: string): Promise<boolean> {
    return this.refreshToUser.get(refreshToken)?.spent === true;
  }

  async revokeFamily(refreshToken: string): Promise<void> {
    const familyId = this.refreshToUser.get(refreshToken)?.familyId;
    if (!familyId) return;
    for (const [token, session] of this.refreshToUser.entries()) {
      if (session.familyId === familyId) this.refreshToUser.delete(token);
    }
  }

  async lastActiveAt(refreshToken: string): Promise<Date | null> {
    return this.refreshToUser.get(refreshToken)?.updatedAt ?? null;
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
      if (session.spent || !userIds.includes(session.user.id)) {
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
