import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  getAuthOrm,
  TwoFactorEnrolmentRecord,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type { CodeAttemptPolicy, StoredTwoFactorEnrolment, TwoFactorRepository } from './two-factor.repository';

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

  async claimCodeAttempt(userId: string, now: Date, { limit, cooldownMs }: CodeAttemptPolicy): Promise<Date | null> {
    const connection = (await this.em()).getConnection();
    const claimed = await connection.execute<Array<{ user_id: string }>>(
      `update auth_two_factor_enrolments
       set failed_code_count = case when failed_code_count + 1 >= ? then 0 else failed_code_count + 1 end,
           codes_blocked_until = case when failed_code_count + 1 >= ? then cast(? as timestamptz) end
       where user_id = ? and (codes_blocked_until is null or codes_blocked_until <= ?)
       returning user_id`,
      [limit, limit, new Date(now.getTime() + cooldownMs), userId, now],
    );
    if (claimed.length > 0) return null;
    const [row] = await connection.execute<Array<{ codes_blocked_until: Date | string | null }>>(
      `select codes_blocked_until from auth_two_factor_enrolments where user_id = ?`,
      [userId],
    );
    return row?.codes_blocked_until ? new Date(row.codes_blocked_until) : now;
  }

  async clearCodeAttempts(userId: string): Promise<void> {
    const em = await this.em();
    await em.nativeUpdate(TwoFactorEnrolmentRecord, { userId }, { failedCodeCount: 0, codesBlockedUntil: null });
  }

  private async em() {
    const orm = await getAuthOrm(this.config.db);
    return orm.em.fork();
  }
}

@Injectable()
export class InMemoryTwoFactorRepository implements TwoFactorRepository {
  private readonly store = new Map<string, StoredTwoFactorEnrolment>();
  private readonly attempts = new Map<string, { count: number; blockedUntil: Date | null }>();

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
    this.attempts.delete(userId);
  }

  async claimCodeAttempt(userId: string, now: Date, { limit, cooldownMs }: CodeAttemptPolicy): Promise<Date | null> {
    if (!this.store.has(userId)) return now;
    const current = this.attempts.get(userId) ?? { count: 0, blockedUntil: null };
    if (current.blockedUntil && current.blockedUntil > now) return current.blockedUntil;
    const count = current.count + 1;
    this.attempts.set(
      userId,
      count >= limit ? { count: 0, blockedUntil: new Date(now.getTime() + cooldownMs) } : { count, blockedUntil: null },
    );
    return null;
  }

  async clearCodeAttempts(userId: string): Promise<void> {
    this.attempts.delete(userId);
  }
}
