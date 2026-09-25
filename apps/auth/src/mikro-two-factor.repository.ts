import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  getAuthOrm,
  TwoFactorEnrolmentRecord,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type { StoredTwoFactorEnrolment, TwoFactorRepository } from './two-factor.repository';

@Injectable()
export class MikroTwoFactorRepository implements TwoFactorRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async findByUserId(userId: string): Promise<StoredTwoFactorEnrolment | null> {
    const em = await this.em();
    const record = await em.findOne(TwoFactorEnrolmentRecord, { userId });
    if (!record) return null;

    return {
      userId: record.userId,
      secretCiphertext: record.secretCiphertext,
      confirmedAt: record.confirmedAt ?? null,
      recoveryCodeHashes: record.recoveryCodeHashes ?? [],
      lastUsedStep: record.lastUsedStep ?? null,
      version: record.version ?? 0,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  async save(enrolment: StoredTwoFactorEnrolment): Promise<void> {
    const em = await this.em();
    await em.upsert(TwoFactorEnrolmentRecord, { ...enrolment });
  }

  async saveIfVersion(enrolment: StoredTwoFactorEnrolment, expectedVersion: number): Promise<boolean> {
    const em = await this.em();
    const { userId, ...fields } = enrolment;
    const changed = await em.nativeUpdate(TwoFactorEnrolmentRecord, { userId, version: expectedVersion }, fields);
    return changed === 1;
  }

  async deleteByUserId(userId: string): Promise<void> {
    const em = await this.em();
    await em.nativeDelete(TwoFactorEnrolmentRecord, { userId });
  }

  private async em() {
    const orm = await getAuthOrm(this.config.db);
    return orm.em.fork();
  }
}

@Injectable()
export class InMemoryTwoFactorRepository implements TwoFactorRepository {
  private readonly store = new Map<string, StoredTwoFactorEnrolment>();

  async findByUserId(userId: string): Promise<StoredTwoFactorEnrolment | null> {
    return this.store.get(userId) ?? null;
  }

  async save(enrolment: StoredTwoFactorEnrolment): Promise<void> {
    this.store.set(enrolment.userId, { ...enrolment });
  }

  async saveIfVersion(enrolment: StoredTwoFactorEnrolment, expectedVersion: number): Promise<boolean> {
    if (this.store.get(enrolment.userId)?.version !== expectedVersion) return false;
    this.store.set(enrolment.userId, { ...enrolment });
    return true;
  }

  async deleteByUserId(userId: string): Promise<void> {
    this.store.delete(userId);
  }
}
