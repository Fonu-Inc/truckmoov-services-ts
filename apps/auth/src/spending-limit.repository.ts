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
  /**
   * Adds a spend to an enabled limit in one statement, restarting the total and
   * the announced thresholds first when the stored window is not `windowStartedOn`.
   * Returns the row after the add, or null when no limit is enabled.
   */
  addSpend(tenantId: string, amountKobo: number, windowStartedOn: string): Promise<StoredSpendingLimit | null>;
  markNotified(tenantId: string, windowStartedOn: string, percentages: number[]): Promise<void>;
  deleteByTenantId(tenantId: string): Promise<void>;
}

export const SPENDING_LIMIT_REPOSITORY = Symbol('SPENDING_LIMIT_REPOSITORY');
