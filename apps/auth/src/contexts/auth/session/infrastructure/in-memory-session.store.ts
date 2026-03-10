import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../domain/entities/auth-user.entity";
import type { SessionStore } from "../domain/ports/session-store.port";

@Injectable()
export class InMemorySessionStore implements SessionStore {
  private readonly refreshToUser = new Map<string, AuthUser>();

  async save(refreshToken: string, user: AuthUser): Promise<void> {
    this.refreshToUser.set(refreshToken, user);
  }

  async getByRefreshToken(refreshToken: string): Promise<AuthUser | null> {
    return this.refreshToUser.get(refreshToken) ?? null;
  }

  async deleteByRefreshToken(refreshToken: string): Promise<void> {
    this.refreshToUser.delete(refreshToken);
  }

  async deleteAllForUser(userId: string): Promise<void> {
    for (const [token, user] of this.refreshToUser.entries()) {
      if (user.id === userId) this.refreshToUser.delete(token);
    }
  }
}
