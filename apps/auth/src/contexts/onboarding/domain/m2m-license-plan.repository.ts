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
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export interface M2mLicensePlanRepository {
  save(plan: StoredM2mLicensePlan): Promise<void>;
  findByCode(code: string): Promise<StoredM2mLicensePlan | null>;
  findActive(): Promise<StoredM2mLicensePlan[]>;
}

export const M2M_LICENSE_PLAN_REPOSITORY = Symbol(
  'M2M_LICENSE_PLAN_REPOSITORY',
);
