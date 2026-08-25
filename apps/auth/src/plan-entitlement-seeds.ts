import type { PlanEntitlements } from './plan-entitlements';

/**
 * The entitlements each seeded plan starts with.
 *
 * Derived from what the plan cards already claim, so seeding changes nothing a
 * tenant can see: Starter's card says "Up to 25 vehicles" and "2 user seats",
 * and those are its quotas here. Numbers that the cards never stated are set
 * deliberately rather than guessed at zero, because zero is a real limit that
 * refuses everything.
 *
 * Keyed by tier rather than plan code: codes are generated per deployment,
 * tiers are stable.
 */
export type PlanEntitlementSeed = Omit<PlanEntitlements, 'planCode'> & {
  tier: 'starter' | 'professional' | 'enterprise';
};

export const PLAN_ENTITLEMENT_SEEDS: PlanEntitlementSeed[] = [
  {
    tier: 'starter',
    paymentModel: 'prepaid',
    inheritsFromCode: null,
    quotas: {
      vehicles: 25,
      drivers: 25,
      devices: 25,
      sims: 25,
      storage_gb: 10,
      geofences: 5,
    },
    // Block is the only behaviour that refuses. Chosen for every resource
    // because billing an overage needs a rate per resource, and there is none.
    limitBehaviour: {
      vehicles: 'block',
      drivers: 'block',
      devices: 'block',
      sims: 'block',
      storage_gb: 'block',
      geofences: 'block',
    },
    features: [
      { key: 'fleet_management', label: 'Basic fleet management', enabled: true, limit: null },
      { key: 'gps_tracking', label: 'Real-time GPS tracking', enabled: true, limit: null },
      { key: 'messaging', label: 'WhatsApp and email messaging', enabled: true, limit: null },
      { key: 'geofencing', label: 'Geofencing', enabled: true, limit: 5 },
      { key: 'support_standard', label: 'Standard support', enabled: true, limit: null },
    ],
    allowances: [
      { item: 'messages', includedPerMonth: 1_000 },
      { item: 'call_minutes', includedPerMonth: 0 },
      { item: 'ai_requests', includedPerMonth: 0 },
      { item: 'sim_connectivity', includedPerMonth: 0 },
    ],
    availableFor: ['fleet_provider', 'enterprise', 'aggregator', 'owner_operator'],
    trialDays: 14,
  },
  {
    tier: 'professional',
    paymentModel: 'prepaid',
    // "Everything in Starter" on the card, expressed as data.
    inheritsFromCode: 'starter',
    quotas: {
      vehicles: 100,
      drivers: 100,
      devices: 100,
      sims: 100,
      storage_gb: 50,
      geofences: 50,
    },
    limitBehaviour: {
      vehicles: 'block',
      drivers: 'block',
      devices: 'block',
      sims: 'block',
      storage_gb: 'block',
      geofences: 'block',
    },
    features: [
      { key: 'ai_load_matching', label: 'AI load matching', enabled: true, limit: null },
      { key: 'api_access', label: 'API access', enabled: true, limit: null },
      { key: 'geofencing', label: 'Geofencing', enabled: true, limit: 50 },
      { key: 'support_priority', label: 'Priority support', enabled: true, limit: null },
    ],
    allowances: [
      { item: 'messages', includedPerMonth: 5_000 },
      { item: 'ai_requests', includedPerMonth: 500 },
    ],
    availableFor: ['fleet_provider', 'enterprise', 'aggregator', 'owner_operator'],
    trialDays: 14,
  },
  {
    tier: 'enterprise',
    paymentModel: 'postpaid',
    inheritsFromCode: 'professional',
    // Unlimited is its own value. The card renders an infinity symbol, and a
    // large number here would eventually refuse a tenant who grew past it.
    quotas: {
      vehicles: 'unlimited',
      drivers: 'unlimited',
      devices: 'unlimited',
      sims: 'unlimited',
      storage_gb: 'unlimited',
      geofences: 'unlimited',
    },
    limitBehaviour: {},
    features: [
      { key: 'custom_integrations', label: 'Custom integrations', enabled: true, limit: null },
      { key: 'account_manager', label: 'Dedicated account manager', enabled: true, limit: null },
      { key: 'sla', label: 'SLA guarantees', enabled: true, limit: null },
      { key: 'sso', label: 'Single Sign-On (SSO / SAML)', enabled: true, limit: null },
      { key: 'geofencing', label: 'Geofencing', enabled: true, limit: null },
    ],
    allowances: [
      { item: 'messages', includedPerMonth: 25_000 },
      { item: 'call_minutes', includedPerMonth: 1_000 },
      { item: 'ai_requests', includedPerMonth: 5_000 },
    ],
    availableFor: ['fleet_provider', 'enterprise', 'aggregator', 'owner_operator'],
    trialDays: 30,
  },
];
