export type StoredTenantTrial = {
  tenantId: string;
  startedAt: Date;
  trialEndsAt: Date;
  extendedCount: number;
  convertedAt: Date | null;
  convertedPlanCode: string | null;
};

export interface TenantTrialRepository {
  findByTenant(tenantId: string): Promise<StoredTenantTrial | null>;
  /** Records the trial unless the tenant already has one; false then. */
  startIfAbsent(tenantId: string, startedAt: Date, trialEndsAt: Date): Promise<boolean>;
  extend(tenantId: string, trialEndsAt: Date, updatedBy: string): Promise<void>;
  markConverted(tenantId: string, at: Date, planCode: string, updatedBy: string): Promise<void>;
}

export const TENANT_TRIAL_REPOSITORY = Symbol('TENANT_TRIAL_REPOSITORY');
