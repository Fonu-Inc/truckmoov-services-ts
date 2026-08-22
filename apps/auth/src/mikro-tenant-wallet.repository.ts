import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { LockMode, type EntityManager } from '@mikro-orm/core';
import { AppConfigService } from '@shared/config';
import {
  TenantWalletRecord,
  WalletLedgerEntryRecord,
  getAuthOrm,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type {
  StoredTenantWallet,
  TenantWalletRepository,
  WalletMovementResult,
} from './tenant-wallet.repository';
import type { WalletLedgerDraft } from './wallet-ledger.repository';

function toStored(r: TenantWalletRecord): StoredTenantWallet {
  return {
    tenantId: r.tenantId,
    balanceKobo: r.balanceKobo,
    currency: r.currency,
    updatedAt: r.updatedAt,
  };
}

@Injectable()
export class MikroTenantWalletRepository implements TenantWalletRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async findByTenantId(tenantId: string): Promise<StoredTenantWallet | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(TenantWalletRecord, { tenantId });
    return record ? toStored(record) : null;
  }

  async save(wallet: StoredTenantWallet): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(TenantWalletRecord, wallet as unknown as TenantWalletRecord);
  }

  async debit(
    tenantId: string,
    amountKobo: number,
    entry: WalletLedgerDraft,
  ): Promise<WalletMovementResult> {
    const orm = await getAuthOrm(this.config.db);
    return orm.em.fork().transactional(async (em) => {
      const record = await em.findOne(
        TenantWalletRecord,
        { tenantId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!record || record.balanceKobo < amountKobo) {
        return { ok: false, balanceAfterKobo: null };
      }
      record.balanceKobo -= amountKobo;
      record.updatedAt = new Date();
      writeLedgerEntry(em, tenantId, 'debit', amountKobo, record.balanceKobo, entry);
      await em.flush();
      return { ok: true, balanceAfterKobo: record.balanceKobo };
    });
  }

  async credit(
    tenantId: string,
    amountKobo: number,
    entry: WalletLedgerDraft,
  ): Promise<WalletMovementResult> {
    const orm = await getAuthOrm(this.config.db);
    return orm.em.fork().transactional(async (em) => {
      const record = await em.findOne(
        TenantWalletRecord,
        { tenantId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!record) return { ok: false, balanceAfterKobo: null };
      record.balanceKobo += amountKobo;
      record.updatedAt = new Date();
      writeLedgerEntry(em, tenantId, 'credit', amountKobo, record.balanceKobo, entry);
      await em.flush();
      return { ok: true, balanceAfterKobo: record.balanceKobo };
    });
  }
}

/**
 * Queues the ledger row inside the caller's transaction. It is not flushed here:
 * the balance change and this row must land together or not at all.
 */
function writeLedgerEntry(
  em: EntityManager,
  tenantId: string,
  direction: 'debit' | 'credit',
  amountKobo: number,
  balanceAfterKobo: number,
  entry: WalletLedgerDraft,
): void {
  em.persist(
    em.create(WalletLedgerEntryRecord, {
      id: randomUUID(),
      tenantId,
      direction,
      category: entry.category,
      amountKobo,
      balanceAfterKobo,
      unitRateKobo: entry.unitRateKobo,
      quantity: entry.quantity,
      reason: entry.reason,
      reference: entry.reference ?? null,
      createdAt: new Date(),
    } as WalletLedgerEntryRecord),
  );
}
