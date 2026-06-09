export type SubscriptionPlanTier = 'starter' | 'professional' | 'enterprise';

export type StoredSubscriptionPlan = {
  id: string;
  code: string;
  tier: SubscriptionPlanTier;
  name: string;
  description: string;
  monthlyPriceNgn: number | null;
  yearlyMonthlyEquivalentNgn: number | null;
  yearlyDiscountPercent: number | null;
  maxActiveVehicles: number | null;
  maxUsers: number | null;
  customPricing: boolean;
  trialDays: number | null;
  badge: string | null;
  ctaLabel: string;
  features: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export interface SubscriptionPlanRepository {
  save(plan: StoredSubscriptionPlan): Promise<void>;
  findById(id: string): Promise<StoredSubscriptionPlan | null>;
  findByCode(code: string): Promise<StoredSubscriptionPlan | null>;
  findByTier(tier: SubscriptionPlanTier): Promise<StoredSubscriptionPlan | null>;
  findAll(): Promise<StoredSubscriptionPlan[]>;
  count(): Promise<number>;
}

export const SUBSCRIPTION_PLAN_REPOSITORY = Symbol(
  'SUBSCRIPTION_PLAN_REPOSITORY',
);
