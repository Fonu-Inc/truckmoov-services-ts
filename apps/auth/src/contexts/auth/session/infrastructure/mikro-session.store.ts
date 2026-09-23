import { createHash, randomUUID } from "node:crypto";
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

/**
 * Refresh tokens are stored as hashes, so reading the table does not hand
 * out sessions. Rows from before hashing are still found by their plain value
 * until they are rotated away.
 */
function hashed(refreshToken: string): string {
  return `sha256:${createHash("sha256").update(refreshToken).digest("hex")}`;
}

@Injectable()
export class MikroSessionStore implements SessionStore {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  private async em() {
    return (await getAuthOrm(this.config.db)).em.fork();
  }

  private async find(refreshToken: string): Promise<AuthSessionRecord | null> {
    const em = await this.em();
    return (
      (await em.findOne(AuthSessionRecord, { refreshToken: hashed(refreshToken) })) ??
      (await em.findOne(AuthSessionRecord, { refreshToken }))
    );
  }

  async save(refreshToken: string, user: AuthUser): Promise<void> {
    await this.write(refreshToken, user, randomUUID());
  }

  private async write(refreshToken: string, user: AuthUser, familyId: string): Promise<void> {
    await (await this.em()).upsert(AuthSessionRecord, {
      refreshToken: hashed(refreshToken),
      userId: user.id,
      email: user.email,
      roleId: mapRoleNameToId(user.role),
      tenantId: user.tenantId,
      updatedAt: new Date(),
      familyId,
      spentAt: null,
    });
  }

  async getByRefreshToken(refreshToken: string): Promise<AuthUser | null> {
    const record = await this.find(refreshToken);
    return record && !record.spentAt ? this.toDomain(record) : null;
  }

  async rotate(oldToken: string, newToken: string, user: AuthUser): Promise<void> {
    const old = await this.find(oldToken);
    const familyId = old?.familyId ?? randomUUID();
    if (old) {
      await (await this.em()).nativeUpdate(AuthSessionRecord, { refreshToken: old.refreshToken }, { spentAt: new Date(), familyId });
    }
    await this.write(newToken, user, familyId);
  }

  async isSpent(refreshToken: string): Promise<boolean> {
    return Boolean((await this.find(refreshToken))?.spentAt);
  }

  async revokeFamily(refreshToken: string): Promise<void> {
    const record = await this.find(refreshToken);
    if (!record) return;
    const em = await this.em();
    if (record.familyId) await em.nativeDelete(AuthSessionRecord, { familyId: record.familyId });
    await em.nativeDelete(AuthSessionRecord, { refreshToken: record.refreshToken });
  }

  async lastActiveAt(refreshToken: string): Promise<Date | null> {
    return (await this.find(refreshToken))?.updatedAt ?? null;
  }

  async deleteByRefreshToken(refreshToken: string): Promise<void> {
    const em = await this.em();
    await em.nativeDelete(AuthSessionRecord, { refreshToken: hashed(refreshToken) });
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
      { userId: { $in: userIds }, spentAt: null } as never,
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
