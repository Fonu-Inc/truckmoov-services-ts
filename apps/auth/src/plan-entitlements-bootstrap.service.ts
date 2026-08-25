import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { PLAN_ENTITLEMENT_SEEDS } from './plan-entitlement-seeds';
import {
  PLAN_ENTITLEMENTS_REPOSITORY,
  type PlanEntitlementsRepository,
} from './plan-entitlements.repository';
import {
  SUBSCRIPTION_PLAN_REPOSITORY,
  type SubscriptionPlanRepository,
  type SubscriptionPlanTier,
} from './subscription-plan.repository';

/**
 * Gives every seeded plan its entitlements on first boot.
 *
 * Without this the entitlement table is empty, every plan resolves to no
 * quotas and no allowance, and a quota check would refuse a plan it knows
 * nothing about. The seeds mirror what the plan cards already claim, so this
 * changes nothing a tenant can see.
 *
 * Plan codes are generated per deployment, so the seeds are keyed by tier and
 * the code is resolved here. Inheritance is resolved the same way: a seed says
 * it builds on the professional tier, and this turns that into that
 * deployment's professional code.
 */
@Injectable()
export class PlanEntitlementsBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PlanEntitlementsBootstrapService.name);

  constructor(
    @Inject(SUBSCRIPTION_PLAN_REPOSITORY)
    private readonly plans: SubscriptionPlanRepository,
    @Inject(PLAN_ENTITLEMENTS_REPOSITORY)
    private readonly entitlements: PlanEntitlementsRepository,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seed();
    } catch (error) {
      // A failure here must not stop the service starting: the rest of auth
      // works, and every charge simply stays fully billable until it is fixed.
      this.logger.error(
        `plan_entitlement_seed_failed:${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  async seed(): Promise<{ seeded: number }> {
    const plans = await this.plans.findAll();
    const codeByTier = new Map<SubscriptionPlanTier, string>(
      plans.map((plan) => [plan.tier, plan.code]),
    );

    let seeded = 0;
    for (const seedEntry of PLAN_ENTITLEMENT_SEEDS) {
      const planCode = codeByTier.get(seedEntry.tier);
      // A tier with no plan in this deployment has nothing to attach to.
      if (!planCode) continue;

      // Idempotent: an operator who has edited entitlements keeps their edits,
      // because this only ever fills an absence.
      if (await this.entitlements.findByPlanCode(planCode)) continue;

      const { tier, inheritsFromCode, ...rest } = seedEntry;
      await this.entitlements.save(
        {
          ...rest,
          planCode,
          // The seed names a tier; the stored value has to be that tier's code
          // in this deployment.
          inheritsFromCode: inheritsFromCode
            ? (codeByTier.get(inheritsFromCode as SubscriptionPlanTier) ?? null)
            : null,
        },
        null,
      );
      seeded += 1;
      void tier;
    }

    if (seeded > 0) this.logger.log(`Seeded entitlements for ${seeded} plan(s)`);
    return { seeded };
  }
}
