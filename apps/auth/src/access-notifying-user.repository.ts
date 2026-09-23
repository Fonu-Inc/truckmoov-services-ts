import type {
  DispatcherPreferences,
  NotificationPreferences,
  StoredUser,
  UserProfile,
  UserRepository,
} from './contexts/auth/session/domain/ports/user-repository.port';
import type { AccessChangeNotifier } from './access-resolver';

/**
 * Wraps the user store so every change to a role, an account's status or its
 * existence reaches every service's access cache, whichever use case made it.
 */
export class AccessNotifyingUserRepository implements UserRepository {
  constructor(
    private readonly inner: UserRepository,
    private readonly notifier: AccessChangeNotifier,
  ) {}

  findByEmail(email: string) {
    return this.inner.findByEmail(email);
  }
  findById(id: string) {
    return this.inner.findById(id);
  }
  findAll() {
    return this.inner.findAll();
  }
  findAllByTenant(tenantId: string) {
    return this.inner.findAllByTenant(tenantId);
  }
  findByRoles(roles: readonly string[]) {
    return this.inner.findByRoles(roles);
  }
  findAllByTenantFiltered(tenantId: string, filters: { search?: string; role?: string; accountStatus?: string }) {
    return this.inner.findAllByTenantFiltered(tenantId, filters);
  }
  findByVerificationToken(token: string) {
    return this.inner.findByVerificationToken(token);
  }
  updatePassword(userId: string, passwordHash: string) {
    return this.inner.updatePassword(userId, passwordHash);
  }
  updateProfile(userId: string, profile: UserProfile) {
    return this.inner.updateProfile(userId, profile);
  }
  updateNotificationPreferences(userId: string, preferences: NotificationPreferences) {
    return this.inner.updateNotificationPreferences(userId, preferences);
  }
  updateDispatcherPreferences(userId: string, preferences: DispatcherPreferences) {
    return this.inner.updateDispatcherPreferences(userId, preferences);
  }

  async save(user: StoredUser) {
    await this.inner.save(user);
    this.notifier.changed(user.id);
  }
  async updateRole(userId: string, role: string) {
    await this.inner.updateRole(userId, role);
    this.notifier.changed(userId);
  }
  async updateAccountStatus(userId: string, accountStatus: 'enabled' | 'disabled') {
    await this.inner.updateAccountStatus(userId, accountStatus);
    this.notifier.changed(userId);
  }
  async deleteById(userId: string) {
    await this.inner.deleteById(userId);
    this.notifier.changed(userId);
  }
}
