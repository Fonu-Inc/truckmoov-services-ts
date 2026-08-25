/**
 * What a plan gives a tenant, as opposed to what it costs.
 *
 * This is the entitlement source of truth: every "may this tenant add another
 * vehicle" check reads it. Nothing else may decide a limit on its own, because
 * limits that are decided in two places disagree with each other and with the
 * plan the tenant bought.
 */

export const QUOTA_RESOURCES = [
  'vehicles',
  'drivers',
  'devices',
  'sims',
  'storage_gb',
  'geofences',
] as const;
export type QuotaResource = (typeof QUOTA_RESOURCES)[number];

/**
 * Unlimited is its own value, not a large number.
 *
 * The screen renders an infinity symbol, so the data has to carry the
 * distinction. Storing 999999 makes "unlimited" indistinguishable from a big
 * limit, and a tenant on a genuinely large plan would eventually be refused.
 */
export const UNLIMITED = 'unlimited' as const;
export type Quota = number | typeof UNLIMITED;

/** What happens when a tenant reaches a quota. */
export const LIMIT_BEHAVIOURS = ['block', 'warn', 'allow_and_bill'] as const;
export type LimitBehaviour = (typeof LIMIT_BEHAVIOURS)[number];

/**
 * A feature entitlement is a stable key with an optional limit, not a boolean.
 *
 * The key is what the application checks. Checking by display label breaks the
 * first time the label is reworded. The limit exists because some features
 * carry one — "geofencing up to 5 zones" is a quota written as a feature.
 */
export type FeatureEntitlement = {
  key: string;
  label: string;
  enabled: boolean;
  limit: number | null;
};

/** Metered items charged beyond a plan's included allowance. */
export const USAGE_ITEMS = ['messages', 'call_minutes', 'ai_requests', 'sim_connectivity'] as const;
export type UsageItem = (typeof USAGE_ITEMS)[number];

export type UsageAllowance = {
  item: UsageItem;
  /** How much the plan includes each month before the wallet is charged. */
  includedPerMonth: number;
};

export const PAYMENT_MODELS = ['prepaid', 'postpaid'] as const;
export type PaymentModel = (typeof PAYMENT_MODELS)[number];

export const ORGANISATION_TYPES = [
  'fleet_provider',
  'enterprise',
  'aggregator',
  'owner_operator',
] as const;
export type OrganisationType = (typeof ORGANISATION_TYPES)[number];

export type PlanEntitlements = {
  planCode: string;
  paymentModel: PaymentModel;
  /**
   * The plan this one builds on, if any. A higher plan showing "Everything in
   * Starter" is inheritance expressed in the data, and it is resolved here
   * rather than by each caller.
   */
  inheritsFromCode: string | null;
  quotas: Partial<Record<QuotaResource, Quota>>;
  limitBehaviour: Partial<Record<QuotaResource, LimitBehaviour>>;
  features: FeatureEntitlement[];
  allowances: UsageAllowance[];
  availableFor: OrganisationType[];
  trialDays: number;
};

export function isUnlimited(quota: Quota | undefined): boolean {
  return quota === UNLIMITED;
}

/**
 * Whether one more unit fits inside a quota.
 *
 * An absent quota means the plan sets no limit on that resource, which is not
 * the same as zero. Zero is a real limit that refuses everything.
 */
export function fitsWithinQuota(quota: Quota | undefined, currentCount: number): boolean {
  if (quota === undefined || quota === UNLIMITED) return true;
  return currentCount < quota;
}

/**
 * Merges a plan onto the one it inherits from.
 *
 * Resolved once, server-side, so the front end and every quota check see the
 * same effective list. Resolving it in each caller is how two callers end up
 * disagreeing about what a plan includes.
 */
export function resolveEffectiveEntitlements(
  plan: PlanEntitlements,
  ancestors: readonly PlanEntitlements[],
): PlanEntitlements {
  // Base first, then each descendant overrides it, so the plan itself wins.
  const chain = [...ancestors, plan];

  const quotas: Partial<Record<QuotaResource, Quota>> = {};
  const limitBehaviour: Partial<Record<QuotaResource, LimitBehaviour>> = {};
  const featuresByKey = new Map<string, FeatureEntitlement>();
  const allowancesByItem = new Map<UsageItem, UsageAllowance>();

  for (const link of chain) {
    Object.assign(quotas, link.quotas);
    Object.assign(limitBehaviour, link.limitBehaviour);
    for (const feature of link.features) featuresByKey.set(feature.key, feature);
    for (const allowance of link.allowances) allowancesByItem.set(allowance.item, allowance);
  }

  return {
    ...plan,
    quotas,
    limitBehaviour,
    features: [...featuresByKey.values()],
    allowances: [...allowancesByItem.values()],
  };
}

export function featureLimit(
  entitlements: PlanEntitlements,
  key: string,
): { enabled: boolean; limit: number | null } {
  const feature = entitlements.features.find((candidate) => candidate.key === key);
  if (!feature) return { enabled: false, limit: null };
  return { enabled: feature.enabled, limit: feature.limit };
}

export function allowanceFor(entitlements: PlanEntitlements, item: UsageItem): number {
  return entitlements.allowances.find((allowance) => allowance.item === item)?.includedPerMonth ?? 0;
}
