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

  async deleteByTenantId(tenantId: string): Promise<void> {
    this.store.delete(tenantId);
  }
}
