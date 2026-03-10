import { Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import type { StoredUser, UserRepository } from "../domain/ports/user-repository.port";
import { AuthUserRecord, getAuthOrm } from "./persistence/auth-orm";

@Injectable()
export class MikroUserRepository implements UserRepository {
  constructor(private readonly config: AppConfigService) {}

  async findByUsername(username: string): Promise<StoredUser | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(AuthUserRecord, { username });
    return record ?? null;
  }

  async findById(id: string): Promise<StoredUser | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(AuthUserRecord, { id });
    return record ?? null;
  }

  async save(user: StoredUser): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(AuthUserRecord, { ...user, createdAt: new Date() });
  }

  async updateRoles(userId: string, roles: string[]): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.nativeUpdate(AuthUserRecord, { id: userId }, { roles });
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.nativeUpdate(AuthUserRecord, { id: userId }, { passwordHash });
  }
}
