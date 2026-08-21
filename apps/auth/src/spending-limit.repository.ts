export type StoredSpendingLimit = {
  tenantId: string;
  enabled: boolean;
  monthlyLimitKobo: number;
  spentThisMonthKobo: number;
  resetDayOfMonth: number;
  alertEmail: string | null;
  notifyAtPercentages: number[];
  /** Start of the window the stored total belongs to, as YYYY-MM-DD. */
  windowStartedOn: string | null;
  /** Thresholds already announced inside the current window. */
  notifiedPercentages: number[];
  updatedAt: Date;
};

export interface SpendingLimitRepository {
  findByTenantId(tenantId: string): Promise<StoredSpendingLimit | null>;
  save(settings: StoredSpendingLimit): Promise<void>;
  deleteByTenantId(tenantId: string): Promise<void>;
}

export const SPENDING_LIMIT_REPOSITORY = Symbol('SPENDING_LIMIT_REPOSITORY');
