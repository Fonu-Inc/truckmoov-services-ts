import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  StoredTenantWallet,
  TenantWalletRepository,
  WalletMovementResult,
} from './tenant-wallet.repository';
import {
  withNormalizedKey,
  type StoredWalletLedgerEntry,
  type WalletLedgerDraft,
} from './wallet-ledger.repository';
import {
  DEFAULT_LOW_BALANCE_THRESHOLD_KOBO,
  walletCreditFloorKobo,
  type WalletCreditSettings,
} from './wallet-credit';

const NOT_APPLIED: WalletMovementResult = {
  ok: false,
  balanceAfterKobo: null,
  replayed: false,
  entry: null,
};

@Injectable()
export class InMemoryTenantWalletRepository implements TenantWalletRepository {
  private readonly store = new Map<string, StoredTenantWallet>();
  /** Kept alongside the balance so a test can read the ledger the same way the app does. */
  readonly ledger: StoredWalletLedgerEntry[] = [];
  private seq = 0;

  async findByTenantId(tenantId: string): Promise<StoredTenantWallet | null> {
    return this.store.get(tenantId) ?? null;
  }

  async save(wallet: StoredTenantWallet): Promise<void> {
    this.store.set(wallet.tenantId, wallet);
  }

  async updateCreditSettings(tenantId: string, settings: WalletCreditSettings): Promise<StoredTenantWallet> {
    const wallet = this.store.get(tenantId);
    if (!wallet) throw new Error(`No wallet for ${tenantId}`);
    Object.assign(wallet, settings, { updatedAt: new Date() });
    return { ...wallet };
  }

  async findAll(): Promise<StoredTenantWallet[]> {
    return [...this.store.values()];
  }

  async ensure(tenantId: string): Promise<StoredTenantWallet> {
    const existing = this.store.get(tenantId);
    if (existing) return existing;

    const created: StoredTenantWallet = {
      tenantId,
      balanceKobo: 0,
      currency: 'NGN',
      creditEnabled: false,
      creditLimitKobo: null,
      lowBalanceThresholdKobo: DEFAULT_LOW_BALANCE_THRESHOLD_KOBO,
      updatedAt: new Date(),
    };
    this.store.set(tenantId, created);
    return created;
  }

  async debit(
    tenantId: string,
    amountKobo: number,
    entry: WalletLedgerDraft,
  ): Promise<WalletMovementResult> {
    entry = withNormalizedKey(entry);
    const wallet = this.store.get(tenantId);
    const replay = this.replayOf(tenantId, entry);
    if (replay) return replay;
    if (!wallet || wallet.balanceKobo - amountKobo < walletCreditFloorKobo(wallet)) {
      return NOT_APPLIED;
    }
    wallet.balanceKobo -= amountKobo;
    wallet.updatedAt = new Date();
    const stored = this.record(tenantId, 'debit', amountKobo, wallet.balanceKobo, entry);
    return { ok: true, balanceAfterKobo: wallet.balanceKobo, replayed: false, entry: stored };
  }

  async credit(
    tenantId: string,
    amountKobo: number,
    entry: WalletLedgerDraft,
  ): Promise<WalletMovementResult> {
    entry = withNormalizedKey(entry);
    const wallet = this.store.get(tenantId);
    const replay = this.replayOf(tenantId, entry);
    if (replay) return replay;
    if (!wallet) return NOT_APPLIED;
    wallet.balanceKobo += amountKobo;
    wallet.updatedAt = new Date();
    const stored = this.record(tenantId, 'credit', amountKobo, wallet.balanceKobo, entry);
    return { ok: true, balanceAfterKobo: wallet.balanceKobo, replayed: false, entry: stored };
  }

  private replayOf(tenantId: string, draft: WalletLedgerDraft): WalletMovementResult | null {
    if (!draft.idempotencyKey) return null;
    const original = this.ledger.find(
      (e) => e.tenantId === tenantId && e.idempotencyKey === draft.idempotencyKey,
    );
    if (!original) return null;
    return { ok: true, balanceAfterKobo: original.balanceAfterKobo, replayed: true, entry: { ...original } };
  }

  private record(
    tenantId: string,
    direction: 'debit' | 'credit',
    amountKobo: number,
    balanceAfterKobo: number,
    entry: WalletLedgerDraft,
  ): StoredWalletLedgerEntry {
    this.seq += 1;
    const stored: StoredWalletLedgerEntry = {
      ...entry,
      id: randomUUID(),
      seq: this.seq,
      tenantId,
      direction,
      amountKobo,
      balanceAfterKobo,
      reference: entry.reference ?? null,
      idempotencyKey: entry.idempotencyKey ?? null,
      createdAt: new Date(),
    };
    this.ledger.push(stored);
    return { ...stored };
  }
}
