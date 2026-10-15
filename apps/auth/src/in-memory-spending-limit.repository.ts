import { Injectable } from '@nestjs/common';
import type { SpendingLimitRepository, StoredSpendingLimit } from './spending-limit.repository';

@Injectable()
export class InMemorySpendingLimitRepository implements SpendingLimitRepository {
  private readonly store = new Map<string, StoredSpendingLimit>();

  async findByTenantId(tenantId: string): Promise<StoredSpendingLimit | null> {
    return this.store.get(tenantId) ?? null;
  }

  async save(settings: StoredSpendingLimit): Promise<void> {
    this.store.set(settings.tenantId, settings);
  }

  async addSpend(tenantId: string, amountKobo: number, windowStartedOn: string): Promise<StoredSpendingLimit | null> {
    const current = this.store.get(tenantId);
    if (!current?.enabled) return null;
    const sameWindow = current.windowStartedOn === windowStartedOn;
    const updated = {
      ...current,
      spentThisMonthKobo: (sameWindow ? current.spentThisMonthKobo : 0) + amountKobo,
      notifiedPercentages: sameWindow ? current.notifiedPercentages : [],
      windowStartedOn,
      updatedAt: new Date(),
    };
    this.store.set(tenantId, updated);
    return { ...updated };
  }

  async markNotified(tenantId: string, windowStartedOn: string, percentages: number[]): Promise<void> {
    const current = this.store.get(tenantId);
    if (current?.windowStartedOn !== windowStartedOn) return;
    this.store.set(tenantId, { ...current, notifiedPercentages: [...current.notifiedPercentages, ...percentages] });
  }

  async deleteByTenantId(tenantId: string): Promise<void> {
    this.store.delete(tenantId);
  }
}
