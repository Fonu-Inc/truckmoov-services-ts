import { randomBytes } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import {
  SUBSCRIPTION_PLAN_REPOSITORY,
  type StoredSubscriptionPlan,
  type SubscriptionPlanRepository,
} from './subscription-plan.repository';
import {
  LEGACY_PLAN_CODE_TO_TIER,
  SUBSCRIPTION_PLAN_SEEDS,
} from './system-subscription-plans';
import type { SubscriptionPlanTier } from './subscription-plan.repository';
import {
  TENANT_ONBOARDING_REPOSITORY,
  type TenantOnboardingRepository,
} from './tenant-onboarding.repository';

@Injectable()
export class SubscriptionPlansBootstrapService
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(SubscriptionPlansBootstrapService.name);

  constructor(
    @Inject(SUBSCRIPTION_PLAN_REPOSITORY)
    private readonly planRepository: SubscriptionPlanRepository,
    @Inject(TENANT_ONBOARDING_REPOSITORY)
    private readonly onboardingRepository: TenantOnboardingRepository,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const now = new Date();
    const seededTierToCode = new Map<SubscriptionPlanTier, string>();

    // Idempotent per-plan: each tier appears once, so the tier is a stable
    // internal id — re-runs (and concurrent boots) converge on one row per plan.
    for (const seed of SUBSCRIPTION_PLAN_SEEDS) {
      const id = `subscription-plan-${seed.tier}`;
      if (await this.planRepository.findById(id)) {
        continue;
      }
      const code = this.generatePlanCode(seed.tier);
      const plan: StoredSubscriptionPlan = {
        id,
        code,
        tier: seed.tier,
        name: seed.name,
        description: seed.description,
        monthlyPriceNgn: seed.monthlyPriceNgn,
        yearlyMonthlyEquivalentNgn: seed.yearlyMonthlyEquivalentNgn,
        yearlyDiscountPercent: seed.yearlyDiscountPercent,
        maxActiveVehicles: seed.maxActiveVehicles,
        maxUsers: seed.maxUsers,
        customPricing: seed.customPricing,
        trialDays: seed.trialDays,
        badge: seed.badge,
        ctaLabel: seed.ctaLabel,
        features: [...seed.features],
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
      await this.planRepository.save(plan);
      seededTierToCode.set(seed.tier, code);
    }

    if (seededTierToCode.size > 0) {
      this.logger.log(`Seeded ${seededTierToCode.size} subscription plan(s)`);
      await this.remapLegacyTenantPlanCodes(seededTierToCode);
    }
  }

  /**
   * Repoints pre-cutover tenants from retired hardcoded codes onto the seeded
   * code for the same tier (so e.g. an old FLEET_SCALE tenant lands on Enterprise).
   */
  private async remapLegacyTenantPlanCodes(
    seededTierToCode: Map<SubscriptionPlanTier, string>,
  ): Promise<void> {
    const onboardings = await this.onboardingRepository.findAll();
    let remapped = 0;

    for (const onboarding of onboardings) {
      const tier = LEGACY_PLAN_CODE_TO_TIER[onboarding.subscription.planCode];
      if (!tier) {
        continue;
      }
      const newCode = seededTierToCode.get(tier);
      if (!newCode) {
        continue;
      }
      await this.onboardingRepository.save({
        ...onboarding,
        subscription: { ...onboarding.subscription, planCode: newCode },
        updatedAt: new Date(),
      });
      remapped += 1;
    }

    if (remapped > 0) {
      this.logger.log(`Remapped ${remapped} tenant(s) to seeded plan codes`);
    }
  }

  private generatePlanCode(tier: string): string {
    return `plan_${tier}_${randomBytes(6).toString('hex')}`;
  }
}
