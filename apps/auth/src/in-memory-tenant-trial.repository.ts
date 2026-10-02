import { Injectable } from '@nestjs/common';
import type { StoredTenantTrial, TenantTrialRepository } from './tenant-trial.repository';

@Injectable()
export class InMemoryTenantTrialRepository implements TenantTrialRepository {
  private readonly byTenant = new Map<string, StoredTenantTrial>();

  async findByTenant(tenantId: string): Promise<StoredTenantTrial | null> {
    const trial = this.byTenant.get(tenantId);
    return trial ? { ...trial } : null;
  }

  async startIfAbsent(tenantId: string, startedAt: Date, trialEndsAt: Date): Promise<boolean> {
    if (this.byTenant.has(tenantId)) return false;
    this.byTenant.set(tenantId, {
      tenantId,
      startedAt,
      trialEndsAt,
      extendedCount: 0,
      convertedAt: null,
      convertedPlanCode: null,
    });
    return true;
  }

  async extend(tenantId: string, trialEndsAt: Date): Promise<void> {
    const trial = this.byTenant.get(tenantId);
    if (trial) this.byTenant.set(tenantId, { ...trial, trialEndsAt, extendedCount: trial.extendedCount + 1 });
  }

  async markConverted(tenantId: string, at: Date, planCode: string): Promise<void> {
    const trial = this.byTenant.get(tenantId);
    if (trial) this.byTenant.set(tenantId, { ...trial, convertedAt: at, convertedPlanCode: planCode });
  }
}
