import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { AuthUser } from "../domain/entities/auth-user.entity";
import type {
  SessionStore,
  UserSessionActivity,
} from "../domain/ports/session-store.port";
import {
  AuthSessionRecord,
  getAuthOrm,
  mapRoleIdToName,
  mapRoleNameToId,
} from "./persistence/auth-orm";

@Injectable()
export class MikroSessionStore implements SessionStore {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async save(refreshToken: string, user: AuthUser): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();

    await em.upsert(AuthSessionRecord, {
      refreshToken,
      userId: user.id,
      email: user.email,
      roleId: mapRoleNameToId(user.role),
      tenantId: user.tenantId,
      updatedAt: new Date(),
    });
  }

  async getByRefreshToken(refreshToken: string): Promise<AuthUser | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(AuthSessionRecord, { refreshToken });
    return record ? this.toDomain(record) : null;
  }

  async deleteByRefreshToken(refreshToken: string): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.nativeDelete(AuthSessionRecord, { refreshToken });
  }

  async deleteAllForUser(userId: string): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.nativeDelete(AuthSessionRecord, { userId });
  }

  async listUserActivity(userIds: string[]): Promise<UserSessionActivity[]> {
    if (!userIds.length) {
      return [];
    }

    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const records = await em.find(
      AuthSessionRecord,
      { userId: { $in: userIds } } as never,
    );

    const activityByUserId = new Map<string, UserSessionActivity>();

    for (const record of records) {
      const existing = activityByUserId.get(record.userId);
      if (!existing || (existing.lastActiveAt?.getTime() ?? 0) < record.updatedAt.getTime()) {
        activityByUserId.set(record.userId, {
          userId: record.userId,
          hasActiveSession: true,
          lastActiveAt: record.updatedAt,
        });
      }
    }

    return [...activityByUserId.values()];
  }

  private toDomain(record: AuthSessionRecord) {
    return AuthUser.create({
      id: record.userId,
      email: record.email,
      role: mapRoleIdToName(record.roleId),
      tenantId: record.tenantId,
    });
  }
}
