import { Injectable } from "@nestjs/common";
import {
  type DispatcherPreferences,
  type NotificationPreferences,
  type StoredUser,
  type UserProfile,
  type UserRepository,
  normalizeStoredUser,
} from "../domain/ports/user-repository.port";

@Injectable()
export class InMemoryUserRepository implements UserRepository {
  private readonly store = new Map<string, StoredUser>();

  async findByEmail(email: string): Promise<StoredUser | null> {
    const user = this.store.get(email);
    return user ? normalizeStoredUser(user) : null;
  }

  async findById(id: string): Promise<StoredUser | null> {
    for (const user of this.store.values()) {
      if (user.id === id) return normalizeStoredUser(user);
    }
    return null;
  }

  async findAllByTenant(tenantId: string): Promise<StoredUser[]> {
    const users: StoredUser[] = [];
    for (const user of this.store.values()) {
      if (user.tenantId === tenantId) {
        users.push(normalizeStoredUser(user));
      }
    }

    return users.sort((left, right) => left.email.localeCompare(right.email));
  }

  async findByVerificationToken(token: string): Promise<StoredUser | null> {
    for (const user of this.store.values()) {
      if (user.emailVerificationToken === token) return normalizeStoredUser(user);
    }
    return null;
  }

  async save(user: StoredUser): Promise<void> {
    this.store.set(user.email, normalizeStoredUser(user));
  }

  async updateRole(userId: string, role: string): Promise<void> {
    this.updateByUserId(userId, (user) => ({ ...user, role }));
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    this.updateByUserId(userId, (user) => ({ ...user, passwordHash }));
  }

  async updateProfile(userId: string, profile: UserProfile): Promise<void> {
    this.updateByUserId(userId, (user) => ({ ...user, profile }));
  }

  async deleteById(userId: string): Promise<void> {
    for (const [key, user] of this.store.entries()) {
      if (user.id === userId) {
        this.store.delete(key);
        return;
      }
    }
  }

  async updateNotificationPreferences(
    userId: string,
    preferences: NotificationPreferences,
  ): Promise<void> {
    this.updateByUserId(userId, (user) => ({
      ...user,
      notificationPreferences: preferences,
    }));
  }

  async updateDispatcherPreferences(
    userId: string,
    preferences: DispatcherPreferences,
  ): Promise<void> {
    this.updateByUserId(userId, (user) => ({
      ...user,
      dispatcherPreferences: preferences,
    }));
  }

  private updateByUserId(
    userId: string,
    updater: (user: StoredUser) => StoredUser,
  ): void {
    for (const [key, user] of this.store.entries()) {
      if (user.id === userId) {
        this.store.set(key, normalizeStoredUser(updater(user)));
        return;
      }
    }
  }
}
