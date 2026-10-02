import { Injectable } from '@nestjs/common';
import {
  noQuotaOverrides,
  type QuotaOverrides,
  type TenantQuotaOverridesRepository,
} from './tenant-quota-overrides.repository';

@Injectable()
export class InMemoryTenantQuotaOverridesRepository implements TenantQuotaOverridesRepository {
  private readonly byTenant = new Map<string, QuotaOverrides>();

  async findByTenant(tenantId: string): Promise<QuotaOverrides> {
    return { ...(this.byTenant.get(tenantId) ?? noQuotaOverrides()) };
  }

  async findAll(): Promise<Map<string, QuotaOverrides>> {
    return new Map([...this.byTenant].map(([id, overrides]) => [id, { ...overrides }]));
  }

  async save(tenantId: string, overrides: QuotaOverrides): Promise<void> {
    this.byTenant.set(tenantId, { ...overrides });
  }
}
