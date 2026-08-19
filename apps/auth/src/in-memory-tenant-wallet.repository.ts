import { Injectable } from '@nestjs/common';
import type { StoredTenantWallet, TenantWalletRepository } from './tenant-wallet.repository';

@Injectable()
export class InMemoryTenantWalletRepository implements TenantWalletRepository {
  private readonly store = new Map<string, StoredTenantWallet>();

  async findByTenantId(tenantId: string): Promise<StoredTenantWallet | null> {
    return this.store.get(tenantId) ?? null;
  }

  async save(wallet: StoredTenantWallet): Promise<void> {
    this.store.set(wallet.tenantId, wallet);
  }

  async debit(tenantId: string, amountKobo: number): Promise<boolean> {
    const wallet = this.store.get(tenantId);
    if (!wallet || wallet.balanceKobo < amountKobo) return false;
    wallet.balanceKobo -= amountKobo;
    wallet.updatedAt = new Date();
    return true;
  }

  async credit(tenantId: string, amountKobo: number): Promise<void> {
    const wallet = this.store.get(tenantId);
    if (!wallet) return;
    wallet.balanceKobo += amountKobo;
    wallet.updatedAt = new Date();
  }
}
