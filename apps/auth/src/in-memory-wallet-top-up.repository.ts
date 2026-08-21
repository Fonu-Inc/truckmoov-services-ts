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

  async findByReference(reference: string): Promise<StoredWalletTopUp | null> {
    return [...this.store.values()].find((t) => t.reference === reference) ?? null;
  }

  async markSettled(id: string, settledAt: Date): Promise<boolean> {
    const existing = this.store.get(id);
    if (!existing || existing.status !== 'pending') return false;
    this.store.set(id, { ...existing, status: 'success', settledAt });
    return true;
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
