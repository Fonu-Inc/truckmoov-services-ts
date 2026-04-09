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
  mapRoleIdToName,
  mapRoleNameToId,
} from "./persistence/auth-orm";

function toStoredUser(record: AuthUserRecord): StoredUser {
  return {
    ...record,
    role: mapRoleIdToName(record.roleId),
    accountStatus: record.accountStatus as "enabled" | "disabled",
    emailVerificationToken: record.emailVerificationToken ?? null,
  };
}

@Injectable()
export class MikroUserRepository implements UserRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async findByEmail(email: string): Promise<StoredUser | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(AuthUserRecord, { email });
    return record ? normalizeStoredUser(toStoredUser(record)) : null;
  }

  async findById(id: string): Promise<StoredUser | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(AuthUserRecord, { id });
    return record ? normalizeStoredUser(toStoredUser(record)) : null;
  }

  async findAll(): Promise<StoredUser[]> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const records = await em.find(AuthUserRecord, {}, {
      orderBy: { email: "asc" },
    });
    return records.map((record) => normalizeStoredUser(toStoredUser(record)));
  }

  async findAllByTenant(tenantId: string): Promise<StoredUser[]> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const records = await em.find(AuthUserRecord, { tenantId }, {
      orderBy: { email: "asc" },
    });
    return records.map((record) => normalizeStoredUser(toStoredUser(record)));
  }

  async findByVerificationToken(token: string): Promise<StoredUser | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(AuthUserRecord, { emailVerificationToken: token });
    return record ? normalizeStoredUser(toStoredUser(record)) : null;
  }

  async save(user: StoredUser): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const normalized = normalizeStoredUser(user);
    await em.upsert(AuthUserRecord, {
      id: normalized.id,
      email: normalized.email,
      passwordHash: normalized.passwordHash,
      roleId: mapRoleNameToId(normalized.role),
      tenantId: normalized.tenantId,
      accountStatus: normalized.accountStatus,
      emailVerificationToken: normalized.emailVerificationToken ?? null,
      profile: normalized.profile,
      notificationPreferences: normalized.notificationPreferences,
      dispatcherPreferences: normalized.dispatcherPreferences,
    });
  }

  async updateRole(userId: string, role: string): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.nativeUpdate(AuthUserRecord, { id: userId }, {
      roleId: mapRoleNameToId(role),
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

  async updateAccountStatus(
    userId: string,
    accountStatus: "enabled" | "disabled",
  ): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.nativeUpdate(AuthUserRecord, { id: userId }, { accountStatus });
  }

  async deleteById(userId: string): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.nativeDelete(AuthUserRecord, { id: userId });
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
