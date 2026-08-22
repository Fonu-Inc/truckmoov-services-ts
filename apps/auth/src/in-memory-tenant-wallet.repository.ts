import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  StoredTenantWallet,
  TenantWalletRepository,
  WalletMovementResult,
} from './tenant-wallet.repository';
import type {
  StoredWalletLedgerEntry,
  WalletLedgerDraft,
} from './wallet-ledger.repository';

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

  async debit(
    tenantId: string,
    amountKobo: number,
    entry: WalletLedgerDraft,
  ): Promise<WalletMovementResult> {
    const wallet = this.store.get(tenantId);
    if (!wallet || wallet.balanceKobo < amountKobo) {
      return { ok: false, balanceAfterKobo: null };
    }
    wallet.balanceKobo -= amountKobo;
    wallet.updatedAt = new Date();
    this.record(tenantId, 'debit', amountKobo, wallet.balanceKobo, entry);
    return { ok: true, balanceAfterKobo: wallet.balanceKobo };
  }

  async credit(
    tenantId: string,
    amountKobo: number,
    entry: WalletLedgerDraft,
  ): Promise<WalletMovementResult> {
    const wallet = this.store.get(tenantId);
    if (!wallet) return { ok: false, balanceAfterKobo: null };
    wallet.balanceKobo += amountKobo;
    wallet.updatedAt = new Date();
    this.record(tenantId, 'credit', amountKobo, wallet.balanceKobo, entry);
    return { ok: true, balanceAfterKobo: wallet.balanceKobo };
  }

  private record(
    tenantId: string,
    direction: 'debit' | 'credit',
    amountKobo: number,
    balanceAfterKobo: number,
    entry: WalletLedgerDraft,
  ): void {
    this.seq += 1;
    this.ledger.push({
      ...entry,
      id: randomUUID(),
      seq: this.seq,
      tenantId,
      direction,
      amountKobo,
      balanceAfterKobo,
      reference: entry.reference ?? null,
      createdAt: new Date(),
    });
  }
}
