import { Injectable } from '@nestjs/common';
import type { AutoTopUpRepository, StoredAutoTopUp } from './auto-topup.repository';

@Injectable()
export class InMemoryAutoTopUpRepository implements AutoTopUpRepository {
  private readonly store = new Map<string, StoredAutoTopUp>();

  async findByTenantId(tenantId: string): Promise<StoredAutoTopUp | null> {
    return this.store.get(tenantId) ?? null;
  }

  async save(settings: StoredAutoTopUp): Promise<void> {
    this.store.set(settings.tenantId, settings);
  }

  async deleteByTenantId(tenantId: string): Promise<void> {
    this.store.delete(tenantId);
  }
}
