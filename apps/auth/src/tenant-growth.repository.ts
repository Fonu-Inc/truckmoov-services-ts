export interface TenantGrowthRepository {
  /** Tenants created per Africa/Lagos month, keyed `YYYY-MM`. Creation date is the onboarding date, else the earliest user. */
  tenantsCreatedByLagosMonth(): Promise<Map<string, number>>;
}

export const TENANT_GROWTH_REPOSITORY = Symbol('TENANT_GROWTH_REPOSITORY');
