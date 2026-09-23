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
  } as unknown as StoredUser;
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

  async findByRoles(roles: readonly string[]): Promise<StoredUser[]> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const records = await em.find(AuthUserRecord, { roleId: { $in: roles.map(mapRoleNameToId) } }, {
      orderBy: { email: "asc" },
    });
    return records.map((record) => normalizeStoredUser(toStoredUser(record)));
  }

  async findAllByTenantFiltered(
    tenantId: string,
    filters: { search?: string; role?: string; accountStatus?: string },
  ): Promise<StoredUser[]> {
    const orm = await getAuthOrm(this.config.db);

    if (!filters.search) {
      const where: Record<string, unknown> = { tenantId };
      if (filters.role) where.roleId = mapRoleNameToId(filters.role);
      if (filters.accountStatus) where.accountStatus = filters.accountStatus;
      const em = orm.em.fork();
      const records = await em.find(AuthUserRecord, where, { orderBy: { email: 'asc' } });
      return records.map((r) => normalizeStoredUser(toStoredUser(r)));
    }

    const params: unknown[] = [tenantId, filters.search, filters.search, `%${filters.search}%`, `%${filters.search}%`, filters.search, filters.search];
    const conditions: string[] = [
      `tenant_id = $1`,
      `(word_similarity($2, email) > 0.15 OR word_similarity($3, profile->>'fullName') > 0.15 OR email ILIKE $4 OR profile->>'fullName' ILIKE $5)`,
    ];

    let paramIdx = params.length + 1;
    if (filters.role) {
      conditions.push(`role_id = $${paramIdx}`);
      params.push(mapRoleNameToId(filters.role));
      paramIdx++;
    }
    if (filters.accountStatus) {
      conditions.push(`account_status = $${paramIdx}`);
      params.push(filters.accountStatus);
    }

    const sql = `
      SELECT * FROM auth_users
      WHERE ${conditions.join(' AND ')}
      ORDER BY GREATEST(
        word_similarity($6, email),
        COALESCE(word_similarity($7, profile->>'fullName'), 0)
      ) DESC
    `;

    const conn = orm.em.getConnection();
    const rows = (await conn.execute(sql, params)) as Record<string, unknown>[];

    return rows.map((row) => {
      const record = new AuthUserRecord();
      Object.assign(record, {
        id: row.id,
        email: row.email,
        passwordHash: row.password_hash,
        roleId: row.role_id,
        tenantId: row.tenant_id,
        accountStatus: row.account_status,
        customRoleId: row.custom_role_id ?? null,
        emailVerificationToken: row.email_verification_token ?? null,
        profile: row.profile,
        notificationPreferences: row.notification_preferences,
        dispatcherPreferences: row.dispatcher_preferences,
        createdAt: row.created_at,
      });
      return normalizeStoredUser(toStoredUser(record));
    });
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

  async updateCustomRole(userId: string, customRoleId: string | null): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    await orm.em.fork().nativeUpdate(AuthUserRecord, { id: userId }, { customRoleId });
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
