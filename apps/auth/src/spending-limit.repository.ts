export type StoredSpendingLimit = {
  tenantId: string;
  enabled: boolean;
  monthlyLimitKobo: number;
  spentThisMonthKobo: number;
  resetDayOfMonth: number;
  alertEmail: string | null;
  notifyAtPercentages: number[];
  updatedAt: Date;
};

export interface SpendingLimitRepository {
  findByTenantId(tenantId: string): Promise<StoredSpendingLimit | null>;
  save(settings: StoredSpendingLimit): Promise<void>;
  deleteByTenantId(tenantId: string): Promise<void>;
}

export const SPENDING_LIMIT_REPOSITORY = Symbol('SPENDING_LIMIT_REPOSITORY');
