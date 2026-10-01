import { Inject, Injectable } from '@nestjs/common';
import {
  TENANT_WALLET_REPOSITORY,
  type TenantWalletRepository,
} from './tenant-wallet.repository';
import type {
  CrossTenantLedgerFilters,
  StoredWalletLedgerEntry,
  WalletLedgerFilters,
  WalletLedgerRepository,
} from './wallet-ledger.repository';

/**
 * Reads the entries the in-memory wallet recorded, so the in-memory backend
 * shows the same ledger the database one would.
 */
@Injectable()
export class InMemoryWalletLedgerRepository implements WalletLedgerRepository {
  constructor(
    @Inject(TENANT_WALLET_REPOSITORY)
    private readonly wallet: TenantWalletRepository,
  ) {}

  private entries(): StoredWalletLedgerEntry[] {
    return (this.wallet as unknown as { ledger?: StoredWalletLedgerEntry[] }).ledger ?? [];
  }

  async list(
    tenantId: string,
    filters?: WalletLedgerFilters,
  ): Promise<{ items: StoredWalletLedgerEntry[]; total: number }> {
    const matching = this.matching(tenantId, filters).sort((a, b) => b.seq - a.seq);
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 50;
    return {
      items: matching.slice((page - 1) * limit, (page - 1) * limit + limit),
      total: matching.length,
    };
  }

  async listAcrossTenants(
    filters?: CrossTenantLedgerFilters,
  ): Promise<{ items: StoredWalletLedgerEntry[]; total: number }> {
    const query = filters?.query?.trim().toLowerCase();
    const matching = this.entries()
      .filter((entry) => {
        if (filters?.tenantId && entry.tenantId !== filters.tenantId) return false;
        if (filters?.category && entry.category !== filters.category) return false;
        if (filters?.direction && entry.direction !== filters.direction) return false;
        if (filters?.from && entry.createdAt < filters.from) return false;
        if (filters?.to && entry.createdAt > filters.to) return false;
        if (!query) return true;
        return [entry.tenantId, entry.reason, entry.reference ?? ''].some((value) =>
          value.toLowerCase().includes(query),
        );
      })
      // Per tenant, then newest first within each. A single platform-wide
      // ordering would interleave running balances that belong to different
      // wallets.
      .sort((a, b) => a.tenantId.localeCompare(b.tenantId) || b.seq - a.seq);

    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 50;
    return {
      items: matching.slice((page - 1) * limit, (page - 1) * limit + limit),
      total: matching.length,
    };
  }

  async findByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
  ): Promise<StoredWalletLedgerEntry | null> {
    return (
      this.entries().find(
        (entry) => entry.tenantId === tenantId && entry.idempotencyKey === idempotencyKey,
      ) ?? null
    );
  }

  async sum(tenantId: string, filters?: WalletLedgerFilters): Promise<number> {
    return this.matching(tenantId, filters).reduce((total, e) => total + e.amountKobo, 0);
  }

  private matching(tenantId: string, filters?: WalletLedgerFilters): StoredWalletLedgerEntry[] {
    return this.entries().filter((entry) => {
      if (entry.tenantId !== tenantId) return false;
      if (filters?.category && entry.category !== filters.category) return false;
      if (filters?.direction && entry.direction !== filters.direction) return false;
      if (filters?.from && entry.createdAt < filters.from) return false;
      if (filters?.to && entry.createdAt > filters.to) return false;
      return true;
    });
  }
}
