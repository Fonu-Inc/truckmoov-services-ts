import type { StoredBillingPriceChange } from './billing-price-change.repository';

/**
 * The M2M licence an applicant buys, priced per device.
 *
 * Separate from the subscription plans in `subscription-plan.repository.ts`:
 * those are monthly or yearly seats for a tenant that already exists, these are
 * a per-device licence bought once, before any account exists, with a different
 * price in the first year and at renewal.
 */
export type StoredM2mLicensePlan = {
  id: string;
  code: string;
  name: string;
  description: string;
  perDeviceYear1Ngn: number;
  perDeviceRenewalNgn: number;
  validityDays: number;
  components: string[] | null;
  lastPriceChangedAt: Date | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type M2mLicensePlanFilter = {
  q?: string;
  status?: 'all' | 'active' | 'inactive';
  page: number;
  limit: number;
};

export type PricedPlanEdit = {
  plan: StoredM2mLicensePlan;
  changes: StoredBillingPriceChange[];
};

export type PricedPlanEditResult = {
  before: StoredM2mLicensePlan;
  after: StoredM2mLicensePlan;
};

export interface M2mLicensePlanRepository {
  save(plan: StoredM2mLicensePlan): Promise<void>;
  findByCode(code: string): Promise<StoredM2mLicensePlan | null>;
  findActive(): Promise<StoredM2mLicensePlan[]>;
  list(
    filter: M2mLicensePlanFilter,
  ): Promise<{ items: StoredM2mLicensePlan[]; total: number }>;
  nextSortOrder(): Promise<number>;
  /** False when the code is already taken; never overwrites. */
  insertIfMissing(plan: StoredM2mLicensePlan): Promise<boolean>;
  /**
   * Locks the plan row, hands it to `build`, and writes the returned plan and
   * price history in the same transaction. `build` returning null writes
   * nothing. Resolves null when the plan does not exist.
   */
  editPriced(
    code: string,
    build: (current: StoredM2mLicensePlan) => PricedPlanEdit | null,
  ): Promise<PricedPlanEditResult | null>;
  /** Saves the plan and appends its price history in one transaction. */
  savePriced(
    plan: StoredM2mLicensePlan,
    changes: StoredBillingPriceChange[],
  ): Promise<void>;
}

export const M2M_LICENSE_PLAN_REPOSITORY = Symbol(
  'M2M_LICENSE_PLAN_REPOSITORY',
);
