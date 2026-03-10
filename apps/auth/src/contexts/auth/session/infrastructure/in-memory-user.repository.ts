import { Injectable } from "@nestjs/common";
import type { StoredUser, UserRepository } from "../domain/ports/user-repository.port";

@Injectable()
export class InMemoryUserRepository implements UserRepository {
  private readonly store = new Map<string, StoredUser>();

  async findByUsername(username: string): Promise<StoredUser | null> {
    return this.store.get(username) ?? null;
  }

  async findById(id: string): Promise<StoredUser | null> {
    for (const user of this.store.values()) {
      if (user.id === id) return user;
    }
    return null;
  }

  async save(user: StoredUser): Promise<void> {
    this.store.set(user.username, user);
  }

  async updateRoles(userId: string, roles: string[]): Promise<void> {
    for (const [key, user] of this.store.entries()) {
      if (user.id === userId) {
        this.store.set(key, { ...user, roles });
        return;
      }
    }
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    for (const [key, user] of this.store.entries()) {
      if (user.id === userId) {
        this.store.set(key, { ...user, passwordHash });
        return;
      }
    }
  }
}
