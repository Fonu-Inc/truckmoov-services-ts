import { Inject, Injectable } from '@nestjs/common';
import { Role } from '@shared/rbac';
import {
  TOKEN_SERVICE,
  USER_REPOSITORY,
  ForbiddenError,
} from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import {
  SUBSCRIPTION_PLAN_REPOSITORY,
  type SubscriptionPlanRepository,
} from './subscription-plan.repository';
import { SYSTEM_TENANT_ID } from '@shared/identity';

const SYSTEM_VIEWER_ROLES = new Set<string>([
  Role.SUPER_ADMIN,
  Role.SYSTEM_ADMIN,
]);

@Injectable()
export class GetSystemSubscriptionPlansUseCase {
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(SUBSCRIPTION_PLAN_REPOSITORY)
    private readonly planRepository: SubscriptionPlanRepository,
  ) {}

  async execute(accessToken: string) {
    const actor = await resolveActorUser(
      accessToken,
      this.tokenService,
      this.userRepository,
    );
    if (
      actor.tenantId !== SYSTEM_TENANT_ID ||
      !SYSTEM_VIEWER_ROLES.has(actor.role)
    ) {
      throw new ForbiddenError(
        'You are not permitted to view subscription plans',
      );
    }

    const plans = await this.planRepository.findAll();
    return {
      status: true,
      message: 'success',
      data: {
        plans: plans
          .filter((plan) => plan.isActive)
          .map((plan) => ({
            code: plan.code,
            tier: plan.tier,
            name: plan.name,
            description: plan.description,
            monthlyPriceNgn: plan.monthlyPriceNgn,
            yearlyMonthlyEquivalentNgn: plan.yearlyMonthlyEquivalentNgn,
            yearlyDiscountPercent: plan.yearlyDiscountPercent,
            maxActiveVehicles: plan.maxActiveVehicles,
            maxUsers: plan.maxUsers,
            customPricing: plan.customPricing,
            trialDays: plan.trialDays,
            badge: plan.badge,
            ctaLabel: plan.ctaLabel,
            features: [...plan.features],
          })),
        generatedAt: new Date().toISOString(),
      },
    };
  }
}
