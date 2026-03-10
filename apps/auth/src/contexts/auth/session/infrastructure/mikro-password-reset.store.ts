import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import type { PasswordResetStore, StoredPasswordReset } from "../domain/ports/password-reset-store.port";
import { PasswordResetRecord, getAuthOrm } from "./persistence/auth-orm";

@Injectable()
export class MikroPasswordResetStore implements PasswordResetStore {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async save(reset: StoredPasswordReset): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(PasswordResetRecord, { ...reset });
  }

  async findByToken(token: string): Promise<StoredPasswordReset | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(PasswordResetRecord, { token, used: false });
    return record as StoredPasswordReset | null;
  }

  async findByUserIdAndCode(userId: string, code: string): Promise<StoredPasswordReset | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(PasswordResetRecord, { userId, code, used: false });
    return record as StoredPasswordReset | null;
  }

  async markUsed(token: string): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.nativeUpdate(PasswordResetRecord, { token }, { used: true });
  }
}
