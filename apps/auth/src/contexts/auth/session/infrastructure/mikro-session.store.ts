import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { AuthUser } from "../domain/entities/auth-user.entity";
import type { SessionStore } from "../domain/ports/session-store.port";
import {
  AuthSessionRecord,
  getAuthOrm,
  mapRoleIdsToNames,
  mapRoleNamesToIds,
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
      roleIds: mapRoleNamesToIds(user.roles),
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

  private toDomain(record: AuthSessionRecord) {
    return AuthUser.create({
      id: record.userId,
      email: record.email,
      roles: mapRoleIdsToNames(record.roleIds),
      tenantId: record.tenantId,
    });
  }
}
