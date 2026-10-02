import { Inject, Injectable } from '@nestjs/common';
import {
  ENFORCEMENT_SETTINGS_REPOSITORY,
  type EnforcementSettingsRepository,
} from './enforcement-settings.repository';
import {
  PLAN_ENTITLEMENTS_REPOSITORY,
  type PlanEntitlementsRepository,
} from './plan-entitlements.repository';
import type { StoredSubscriptionPlan } from './subscription-plan.repository';

/**
 * How long a new tenant's trial runs: the billing-settings override, else the
 * plan's editable entitlements, else the plan's own column.
 */
@Injectable()
export class TrialDaysResolver {
  constructor(
    @Inject(ENFORCEMENT_SETTINGS_REPOSITORY)
    private readonly enforcement: EnforcementSettingsRepository,
    @Inject(PLAN_ENTITLEMENTS_REPOSITORY)
    private readonly entitlements: PlanEntitlementsRepository,
  ) {}

  async resolve(plan: Pick<StoredSubscriptionPlan, 'code' | 'trialDays'> | null): Promise<number | null> {
    const { onboardingTrialDaysOverride } = await this.enforcement.get();
    if (onboardingTrialDaysOverride !== null) return onboardingTrialDaysOverride;
    if (!plan) return null;
    const entitlements = await this.entitlements.findByPlanCode(plan.code);
    return entitlements?.trialDays ?? plan.trialDays ?? null;
  }
}
