import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { LockMode, UniqueConstraintViolationException, type EntityManager } from '@mikro-orm/core';
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
import { toStoredLedgerEntry } from './mikro-wallet-ledger.repository';
import { withNormalizedKey, type StoredWalletLedgerEntry, type WalletLedgerDraft } from './wallet-ledger.repository';
import {
  DEFAULT_LOW_BALANCE_THRESHOLD_KOBO,
  walletCreditFloorKobo,
  type WalletCreditSettings,
} from './wallet-credit';

function toStored(r: TenantWalletRecord): StoredTenantWallet {
  return {
    tenantId: r.tenantId,
    balanceKobo: Number(r.balanceKobo),
    currency: r.currency,
    creditEnabled: r.creditEnabled ?? false,
    creditLimitKobo:
      r.creditLimitKobo === null || r.creditLimitKobo === undefined
        ? null
        : Number(r.creditLimitKobo),
    lowBalanceThresholdKobo: Number(
      r.lowBalanceThresholdKobo ?? DEFAULT_LOW_BALANCE_THRESHOLD_KOBO,
    ),
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

  async updateCreditSettings(tenantId: string, settings: WalletCreditSettings): Promise<StoredTenantWallet> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.nativeUpdate(
      TenantWalletRecord,
      { tenantId },
      {
        creditEnabled: settings.creditEnabled,
        creditLimitKobo: settings.creditLimitKobo,
        lowBalanceThresholdKobo: settings.lowBalanceThresholdKobo,
        updatedAt: new Date(),
      },
    );
    return toStored(await em.findOneOrFail(TenantWalletRecord, { tenantId }));
  }

  async findAll(): Promise<StoredTenantWallet[]> {
    const orm = await getAuthOrm(this.config.db);
    const records = await orm.em.fork().find(TenantWalletRecord, {}, { orderBy: { tenantId: 'asc' } });
    return records.map(toStored);
  }

  async ensure(tenantId: string): Promise<StoredTenantWallet> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    // Insert-if-absent in one statement, so two callers racing to create the
    // same wallet cannot both think they made it.
    await em.getConnection().execute(
      `insert into tenant_wallets (tenant_id, balance_kobo, currency, low_balance_threshold_kobo)
         values (?, 0, 'NGN', ?)
       on conflict (tenant_id) do nothing`,
      [tenantId, DEFAULT_LOW_BALANCE_THRESHOLD_KOBO],
    );

    const record = await em.findOne(TenantWalletRecord, { tenantId });
    if (!record) throw new Error(`Failed to create a wallet for ${tenantId}`);
    return toStored(record);
  }

  async debit(
    tenantId: string,
    amountKobo: number,
    entry: WalletLedgerDraft,
  ): Promise<WalletMovementResult> {
    return this.move(tenantId, 'debit', amountKobo, entry);
  }

  async credit(
    tenantId: string,
    amountKobo: number,
    entry: WalletLedgerDraft,
  ): Promise<WalletMovementResult> {
    return this.move(tenantId, 'credit', amountKobo, entry);
  }

  private async move(
    tenantId: string,
    direction: 'debit' | 'credit',
    amountKobo: number,
    entry: WalletLedgerDraft,
  ): Promise<WalletMovementResult> {
    entry = withNormalizedKey(entry);
    const orm = await getAuthOrm(this.config.db);
    try {
      return await orm.em
        .fork()
        .transactional((em) => applyMovement(em, tenantId, direction, amountKobo, entry));
    } catch (error) {
      const key = entry.idempotencyKey;
      if (!key || !(error instanceof UniqueConstraintViolationException)) throw error;
      const original = await findByKey(orm.em.fork(), tenantId, key);
      if (!original) throw error;
      return replayResult(original);
    }
  }
}

async function findByKey(
  em: EntityManager,
  tenantId: string,
  idempotencyKey: string,
): Promise<StoredWalletLedgerEntry | null> {
  const record = await em.findOne(WalletLedgerEntryRecord, { tenantId, idempotencyKey });
  return record ? toStoredLedgerEntry(record) : null;
}

function replayResult(original: StoredWalletLedgerEntry): WalletMovementResult {
  return {
    ok: true,
    balanceAfterKobo: original.balanceAfterKobo,
    replayed: true,
    entry: original,
  };
}

async function applyMovement(
  em: EntityManager,
  tenantId: string,
  direction: 'debit' | 'credit',
  amountKobo: number,
  entry: WalletLedgerDraft,
): Promise<WalletMovementResult> {
  const record = await em.findOne(
    TenantWalletRecord,
    { tenantId },
    { lockMode: LockMode.PESSIMISTIC_WRITE },
  );
  if (entry.idempotencyKey) {
    const original = await findByKey(em, tenantId, entry.idempotencyKey);
    if (original) return replayResult(original);
  }
  if (!record || !canMove(record, direction, amountKobo)) return NOT_APPLIED;

  record.balanceKobo = Number(record.balanceKobo) + (direction === 'debit' ? -amountKobo : amountKobo);
  record.updatedAt = new Date();
  const ledger = writeLedgerEntry(em, tenantId, direction, amountKobo, record.balanceKobo, entry);
  await em.flush();
  return {
    ok: true,
    balanceAfterKobo: record.balanceKobo,
    replayed: false,
    entry: toStoredLedgerEntry(ledger),
  };
}

// The credit floor is read and applied inside the same lock as the balance.
// Checking it anywhere else would let two concurrent debits both pass a limit
// that only one of them fits under.
function canMove(record: TenantWalletRecord, direction: 'debit' | 'credit', amountKobo: number) {
  if (direction === 'credit') return true;
  return Number(record.balanceKobo) - amountKobo >= walletCreditFloorKobo(toStored(record));
}

const NOT_APPLIED: WalletMovementResult = {
  ok: false,
  balanceAfterKobo: null,
  replayed: false,
  entry: null,
};

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
): WalletLedgerEntryRecord {
  const ledger = em.create(WalletLedgerEntryRecord, {
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
      idempotencyKey: entry.idempotencyKey ?? null,
      createdAt: new Date(),
    } as WalletLedgerEntryRecord);
  em.persist(ledger);
  return ledger;
}
