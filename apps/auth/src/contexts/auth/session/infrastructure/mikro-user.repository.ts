import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import {
  type DispatcherPreferences,
  type NotificationPreferences,
  type StoredUser,
  type UserProfile,
  type UserRepository,
  normalizeStoredUser,
} from "../domain/ports/user-repository.port";
import {
  AuthUserRecord,
  getAuthOrm,
  mapRoleIdsToNames,
  mapRoleNamesToIds,
} from "./persistence/auth-orm";

@Injectable()
export class MikroUserRepository implements UserRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async findByEmail(email: string): Promise<StoredUser | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(AuthUserRecord, { email });
    return record
      ? normalizeStoredUser({
        ...record,
        roles: mapRoleIdsToNames(record.roleIds),
      })
      : null;
  }

  async findById(id: string): Promise<StoredUser | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(AuthUserRecord, { id });
    return record
      ? normalizeStoredUser({
        ...record,
        roles: mapRoleIdsToNames(record.roleIds),
      })
      : null;
  }

  async save(user: StoredUser): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const normalized = normalizeStoredUser(user);
    await em.upsert(AuthUserRecord, {
      id: normalized.id,
      email: normalized.email,
      passwordHash: normalized.passwordHash,
      roleIds: mapRoleNamesToIds(normalized.roles),
      tenantId: normalized.tenantId,
      profile: normalized.profile,
      notificationPreferences: normalized.notificationPreferences,
      dispatcherPreferences: normalized.dispatcherPreferences,
      createdAt: new Date(),
    });
  }

  async updateRoles(userId: string, roles: string[]): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.nativeUpdate(AuthUserRecord, { id: userId }, {
      roleIds: mapRoleNamesToIds(roles),
    });
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.nativeUpdate(AuthUserRecord, { id: userId }, { passwordHash });
  }

  async updateProfile(userId: string, profile: UserProfile): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.nativeUpdate(AuthUserRecord, { id: userId }, { profile });
  }

  async updateNotificationPreferences(
    userId: string,
    preferences: NotificationPreferences,
  ): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.nativeUpdate(AuthUserRecord, { id: userId }, {
      notificationPreferences: preferences,
    });
  }

  async updateDispatcherPreferences(
    userId: string,
    preferences: DispatcherPreferences,
  ): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.nativeUpdate(AuthUserRecord, { id: userId }, {
      dispatcherPreferences: preferences,
    });
  }
}
