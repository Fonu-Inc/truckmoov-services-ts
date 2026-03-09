import { Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { AuthUser } from "../domain/entities/auth-user.entity";
import type { SessionStore } from "../domain/ports/session-store.port";
import { AuthSessionRecord, getAuthOrm } from "./persistence/auth-orm";

@Injectable()
export class MikroSessionStore implements SessionStore {
  constructor(private readonly config: AppConfigService) {}

  async save(refreshToken: string, user: AuthUser): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();

    await em.upsert(AuthSessionRecord, {
      refreshToken,
      userId: user.id,
      username: user.username,
      roles: user.roles,
      updatedAt: new Date(),
    });
  }

  async getByRefreshToken(refreshToken: string): Promise<AuthUser | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(AuthSessionRecord, { refreshToken });
    return record ? this.toDomain(record) : null;
  }

  private toDomain(record: AuthSessionRecord) {
    return AuthUser.create({
      id: record.userId,
      username: record.username,
      roles: record.roles,
    });
  }
}
