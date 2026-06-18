import { Injectable } from '@nestjs/common';
import type { StoredWalletTopUp, WalletTopUpRepository } from './wallet-top-up.repository';

@Injectable()
export class InMemoryWalletTopUpRepository implements WalletTopUpRepository {
  private readonly store = new Map<string, StoredWalletTopUp>();

  async findAllByTenantId(tenantId: string): Promise<StoredWalletTopUp[]> {
    return [...this.store.values()]
      .filter((t) => t.tenantId === tenantId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async sumSuccessfulByTenantId(tenantId: string): Promise<number> {
    return [...this.store.values()]
      .filter((t) => t.tenantId === tenantId && t.status === 'success')
      .reduce((sum, t) => sum + t.amountKobo, 0);
  }

  async countSuccessfulByTenantId(tenantId: string): Promise<number> {
    return [...this.store.values()].filter(
      (t) => t.tenantId === tenantId && t.status === 'success',
    ).length;
  }

  async save(topUp: StoredWalletTopUp): Promise<void> {
    this.store.set(topUp.id, topUp);
  }
}
