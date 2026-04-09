export type SystemSubscriptionPlanTier =
  | 'starter'
  | 'professional'
  | 'enterprise';

export type SystemSubscriptionPlan = {
  code: string;
  tier: SystemSubscriptionPlanTier;
  name: string;
  description: string;
  monthlyPriceNgn: number | null;
  yearlyMonthlyEquivalentNgn: number | null;
  yearlyDiscountPercent: number | null;
  maxActiveVehicles: number | null;
  customPricing: boolean;
  trialDays: number | null;
  badge: string | null;
  ctaLabel: string;
  features: string[];
};

export const SYSTEM_SUBSCRIPTION_PLANS: SystemSubscriptionPlan[] = [
  {
    code: 'FLEET_STARTER',
    tier: 'starter',
    name: 'Starter',
    description: 'For small fleets',
    monthlyPriceNgn: 49900,
    yearlyMonthlyEquivalentNgn: 39920,
    yearlyDiscountPercent: 20,
    maxActiveVehicles: 10,
    customPricing: false,
    trialDays: 14,
    badge: null,
    ctaLabel: 'Start trial with Starter',
    features: [
      'Live GPS tracking',
      'Driver management',
      'Job dispatch (basic)',
      'WhatsApp driver alerts',
      'Basic reports',
      'Email support',
    ],
  },
  {
    code: 'FLEET_GROWTH',
    tier: 'professional',
    name: 'Growth',
    description: 'For growing fleets',
    monthlyPriceNgn: 149900,
    yearlyMonthlyEquivalentNgn: 119920,
    yearlyDiscountPercent: 20,
    maxActiveVehicles: 50,
    customPricing: false,
    trialDays: 14,
    badge: 'Most Popular',
    ctaLabel: 'Start trial with Growth',
    features: [
      'Everything in Starter',
      'Smart dispatch board',
      'Driver behavior analytics',
      'Preventive maintenance',
      'Invoice from waybill',
      'Fuel monitoring (basic)',
      'Up to 5 admin users',
    ],
  },
  {
    code: 'FLEET_SCALE',
    tier: 'enterprise',
    name: 'Scale',
    description: 'For large operations',
    monthlyPriceNgn: 399900,
    yearlyMonthlyEquivalentNgn: 319920,
    yearlyDiscountPercent: 20,
    maxActiveVehicles: 200,
    customPricing: false,
    trialDays: 14,
    badge: 'For large operations',
    ctaLabel: 'Start trial with Scale',
    features: [
      'Everything in Growth',
      'Financial analytics dashboard',
      'Multi-branch operations',
      'API access + webhooks',
      'Custom reporting exports',
      'Dedicated onboarding',
      'Priority support (SLA)',
    ],
  },
  {
    code: 'FLEET_ENTERPRISE',
    tier: 'enterprise',
    name: 'Enterprise',
    description: 'Unlimited vehicles + custom integrations',
    monthlyPriceNgn: null,
    yearlyMonthlyEquivalentNgn: null,
    yearlyDiscountPercent: null,
    maxActiveVehicles: null,
    customPricing: true,
    trialDays: null,
    badge: 'Custom',
    ctaLabel: 'Talk to Sales',
    features: [
      'Unlimited vehicles',
      'Dedicated success manager',
      'Custom integrations (ERP/WMS/TMS)',
      'Advanced AI optimization',
      'Private cloud / on-prem option',
      'Security & compliance reviews',
    ],
  },
];

export function defaultPlanCodeForTier(
  tier: SystemSubscriptionPlanTier,
): string {
  switch (tier) {
    case 'starter':
      return 'FLEET_STARTER';
    case 'professional':
      return 'FLEET_GROWTH';
    case 'enterprise':
      return 'FLEET_SCALE';
    default:
      return 'FLEET_STARTER';
  }
}
