import type { SubscriptionPlanTier } from './subscription-plan.repository';

export type SystemSubscriptionPlanTier = SubscriptionPlanTier;

/**
 * Seed definitions for the subscription plan catalog. Codes are generated as
 * non-guessable values at seed time and persisted in the
 * `system_subscription_plans` table — these seeds carry no public code. Each
 * tier appears exactly once, so the tier doubles as a stable seed key.
 */
export type SubscriptionPlanSeed = {
  tier: SystemSubscriptionPlanTier;
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
};

export const SUBSCRIPTION_PLAN_SEEDS: SubscriptionPlanSeed[] = [
  {
    tier: 'starter',
    name: 'Starter',
    description: 'For small fleets getting started.',
    monthlyPriceNgn: 50000,
    yearlyMonthlyEquivalentNgn: 45000,
    yearlyDiscountPercent: 10,
    maxActiveVehicles: 25,
    maxUsers: 2,
    customPricing: false,
    trialDays: null,
    badge: null,
    ctaLabel: 'Select Plan',
    features: [
      'Up to 25 vehicles',
      'Basic fleet management',
      '2 user seats',
      'WhatsApp & email alert and messaging',
      'Standard support',
    ],
  },
  {
    tier: 'professional',
    name: 'Professional',
    description: 'Most popular for growing fleets.',
    monthlyPriceNgn: 150000,
    yearlyMonthlyEquivalentNgn: 135000,
    yearlyDiscountPercent: 10,
    maxActiveVehicles: 100,
    maxUsers: 10,
    customPricing: false,
    trialDays: null,
    badge: 'Recommended',
    ctaLabel: 'Select Plan',
    features: [
      'Up to 100 vehicles',
      'Full features',
      '10 user seats',
      'AI load matching',
      'Priority support',
      'API access',
    ],
  },
  {
    tier: 'enterprise',
    name: 'Enterprise',
    description: 'Unlimited scale & custom workflows.',
    monthlyPriceNgn: null,
    yearlyMonthlyEquivalentNgn: null,
    yearlyDiscountPercent: null,
    maxActiveVehicles: null,
    maxUsers: null,
    customPricing: true,
    trialDays: null,
    badge: null,
    ctaLabel: 'Select Plan',
    features: [
      'Up to 100+ vehicles',
      'Unlimited users',
      'Custom integrations',
      'Dedicated account manager',
      'SLA guarantees',
    ],
  },
];

/**
 * Maps retired hardcoded plan codes to their tier. Used to remap pre-cutover
 * tenants onto the seeded codes and as a `normalizePlan` fallback. Kept stable
 * even as the seed list changes (e.g. the old `FLEET_SCALE` tier still resolves
 * after that plan was folded into Enterprise).
 */
export const LEGACY_PLAN_CODE_TO_TIER: Record<
  string,
  SystemSubscriptionPlanTier
> = {
  FLEET_STARTER: 'starter',
  FLEET_GROWTH: 'professional',
  FLEET_SCALE: 'enterprise',
  FLEET_ENTERPRISE: 'enterprise',
};
