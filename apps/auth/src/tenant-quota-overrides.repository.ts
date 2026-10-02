export const OVERRIDABLE_QUOTAS = ['vehicles', 'drivers', 'devices', 'sims'] as const;
export type OverridableQuota = (typeof OVERRIDABLE_QUOTAS)[number];

/** A null entry means no override: the plan limit applies. */
export type QuotaOverrides = Record<OverridableQuota, number | null>;

export function noQuotaOverrides(): QuotaOverrides {
  return { vehicles: null, drivers: null, devices: null, sims: null };
}

/** The plan's limits with each tenant override laid over them. Null stays unlimited. */
export function withQuotaOverrides(plan: QuotaOverrides, overrides: QuotaOverrides): QuotaOverrides {
  const effective = { ...plan };
  for (const resource of OVERRIDABLE_QUOTAS) {
    if (overrides[resource] !== null) effective[resource] = overrides[resource];
  }
  return effective;
}

export interface TenantQuotaOverridesRepository {
  findByTenant(tenantId: string): Promise<QuotaOverrides>;
  findAll(): Promise<Map<string, QuotaOverrides>>;
  save(tenantId: string, overrides: QuotaOverrides, updatedBy: string): Promise<void>;
}

export const TENANT_QUOTA_OVERRIDES_REPOSITORY = Symbol('TENANT_QUOTA_OVERRIDES_REPOSITORY');
