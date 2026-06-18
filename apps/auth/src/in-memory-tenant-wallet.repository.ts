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
}
