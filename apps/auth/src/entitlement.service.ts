import { Inject, Injectable } from '@nestjs/common';
import {
  PLAN_ENTITLEMENTS_REPOSITORY,
  type PlanEntitlementsRepository,
} from './plan-entitlements.repository';
import {
  allowanceFor,
  featureLimit,
  fitsWithinQuota,
  resolveEffectiveEntitlements,
  type PlanEntitlements,
  type QuotaResource,
  type UsageItem,
} from './plan-entitlements';

/** Guards against a plan chain that loops back on itself. */
const MAX_INHERITANCE_DEPTH = 8;

export class PlanNotEntitledError extends Error {
  constructor(planCode: string) {
    super(`No entitlements are configured for plan ${planCode}`);
  }
}

export class QuotaExceededError extends Error {
  constructor(resource: QuotaResource, limit: number) {
    super(`This plan allows ${limit} ${resource.replace('_', ' ')}`);
  }
}

/**
 * The one place that answers what a plan allows.
 *
 * Every quota check reads it, which makes it the most widely read
 * configuration in the platform. Inheritance is resolved here rather than by
 * callers: two callers resolving it separately is how they come to disagree
 * about what a plan includes.
 */
@Injectable()
export class EntitlementService {
  constructor(
    @Inject(PLAN_ENTITLEMENTS_REPOSITORY)
    private readonly repository: PlanEntitlementsRepository,
  ) {}

  /** The plan's own entitlements merged with everything it inherits. */
  async effectiveFor(planCode: string): Promise<PlanEntitlements> {
    const plan = await this.repository.findByPlanCode(planCode);
    if (!plan) throw new PlanNotEntitledError(planCode);

    const ancestors: PlanEntitlements[] = [];
    const seen = new Set<string>([plan.planCode]);
    let cursor = plan.inheritsFromCode;

    while (cursor && ancestors.length < MAX_INHERITANCE_DEPTH) {
      // A cycle would otherwise loop until the depth guard, and the result
      // would depend on where the walk happened to stop.
      if (seen.has(cursor)) break;
      seen.add(cursor);

      const parent = await this.repository.findByPlanCode(cursor);
      if (!parent) break;
      ancestors.unshift(parent);
      cursor = parent.inheritsFromCode;
    }

    return resolveEffectiveEntitlements(plan, ancestors);
  }

  /**
   * Refuses the unit that would exceed the plan.
   *
   * currentCount is what the tenant already has, so a plan of 10 refuses the
   * eleventh rather than the tenth.
   */
  async assertQuota(planCode: string, resource: QuotaResource, currentCount: number): Promise<void> {
    const entitlements = await this.effectiveFor(planCode);
    const quota = entitlements.quotas[resource];
    if (fitsWithinQuota(quota, currentCount)) return;

    // A behaviour of warn or allow_and_bill does not refuse. Only block does,
    // so a plan can be configured to bill an overage instead of stopping work.
    if (entitlements.limitBehaviour[resource] !== 'block') return;
    throw new QuotaExceededError(resource, quota as number);
  }

  async hasFeature(planCode: string, key: string): Promise<boolean> {
    return featureLimit(await this.effectiveFor(planCode), key).enabled;
  }

  async featureLimitFor(planCode: string, key: string): Promise<number | null> {
    return featureLimit(await this.effectiveFor(planCode), key).limit;
  }

  async monthlyAllowance(planCode: string, item: UsageItem): Promise<number> {
    return allowanceFor(await this.effectiveFor(planCode), item);
  }
}
