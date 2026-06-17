import { Inject, Injectable } from '@nestjs/common';
import {
  SUBSCRIPTION_PLAN_REPOSITORY,
  type SubscriptionPlanRepository,
} from './subscription-plan.repository';

@Injectable()
export class GetOnboardingPlansUseCase {
  constructor(
    @Inject(SUBSCRIPTION_PLAN_REPOSITORY)
    private readonly planRepository: SubscriptionPlanRepository,
  ) {}

  async execute() {
    const plans = await this.planRepository.findAll();
    return {
      status: true,
      message: 'success',
      data: {
        plans: plans
          .filter((p) => p.isActive)
          .map((p) => ({
            id: p.id,
            code: p.code,
            tier: p.tier,
            name: p.name,
            description: p.description,
            monthlyPriceNgn: p.monthlyPriceNgn,
            yearlyMonthlyEquivalentNgn: p.yearlyMonthlyEquivalentNgn,
            yearlyDiscountPercent: p.yearlyDiscountPercent,
            maxActiveVehicles: p.maxActiveVehicles,
            maxUsers: p.maxUsers,
            customPricing: p.customPricing,
            trialDays: p.trialDays,
            badge: p.badge,
            ctaLabel: p.ctaLabel,
            features: [...p.features],
          })),
      },
    };
  }
}
