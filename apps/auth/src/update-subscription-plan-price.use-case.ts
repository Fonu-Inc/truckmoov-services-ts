import { Inject, Injectable } from '@nestjs/common';
import { ActivityLogService } from './activity-log.service';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor, SYSTEM_MUTATOR_ROLES } from './system-authz';
import {
  SUBSCRIPTION_PLAN_REPOSITORY,
  type StoredSubscriptionPlan,
  type SubscriptionPlanRepository,
} from './subscription-plan.repository';

export class SubscriptionPlanNotFoundError extends Error {
  constructor() {
    super('Subscription plan not found');
  }
}

export class InvalidSubscriptionPlanPriceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSubscriptionPlanPriceError';
  }
}

export type UpdateSubscriptionPlanPriceCommand = {
  accessToken: string;
  planId: string;
  monthlyPriceNgn?: number;
  yearlyMonthlyEquivalentNgn?: number;
};

@Injectable()
export class UpdateSubscriptionPlanPriceUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SUBSCRIPTION_PLAN_REPOSITORY) private readonly plans: SubscriptionPlanRepository,
    @Inject(ActivityLogService) private readonly activityLog: ActivityLogService,
  ) {}

  /**
   * Note: this changes only the plan's listed price. Nothing on the platform
   * yet records what an existing subscriber was sold at (see TRU-19), so this
   * cannot grandfather anyone — every active subscriber sees the new price at
   * their next render. Scoped that way deliberately rather than inventing a
   * price-lock mechanism the subscription record has nowhere to live.
   */
  async execute(command: UpdateSubscriptionPlanPriceCommand): Promise<StoredSubscriptionPlan> {
    const actor = await ensureSystemActor(command.accessToken, this.tokenService, this.userRepository, {
      allowedRoles: SYSTEM_MUTATOR_ROLES,
      forbiddenMessage: 'You are not permitted to change subscription plan pricing',
    });

    const planReference = command.planId.trim();
    // This route deliberately accepts the canonical plan UUID only. Plan codes
    // are display/catalog keys and must not be interchangeable with identity.
    const plan = await this.plans.findById(planReference);
    if (!plan) throw new SubscriptionPlanNotFoundError();

    if (command.monthlyPriceNgn === undefined && command.yearlyMonthlyEquivalentNgn === undefined) {
      throw new InvalidSubscriptionPlanPriceError('At least one price must be provided');
    }
    for (const [name, value] of [
      ['monthlyPriceNgn', command.monthlyPriceNgn],
      ['yearlyMonthlyEquivalentNgn', command.yearlyMonthlyEquivalentNgn],
    ] as const) {
      if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
        throw new InvalidSubscriptionPlanPriceError(`${name} must be a finite non-negative number`);
      }
    }

    const monthlyPriceNgn = command.monthlyPriceNgn ?? plan.monthlyPriceNgn;
    const yearlyMonthlyEquivalentNgn = command.yearlyMonthlyEquivalentNgn ?? plan.yearlyMonthlyEquivalentNgn;
    const yearlyDiscountPercent =
      monthlyPriceNgn !== null && monthlyPriceNgn > 0 && yearlyMonthlyEquivalentNgn !== null
        ? Math.round((1 - yearlyMonthlyEquivalentNgn / monthlyPriceNgn) * 100)
        : null;

    const updated: StoredSubscriptionPlan = {
      ...plan,
      monthlyPriceNgn,
      yearlyMonthlyEquivalentNgn,
      yearlyDiscountPercent,
      updatedAt: new Date(),
    };
    await this.plans.save(updated);

    await this.activityLog.record({
      tenantId: 'system',
      actorId: actor.id,
      actorRole: actor.role,
      service: 'auth',
      action: 'subscription_plan.price_changed',
      entityType: 'subscription_plan',
      entityId: plan.id,
      summary: `Price changed for plan ${plan.code}`,
      metadata: {
        previousMonthlyPriceNgn: plan.monthlyPriceNgn,
        previousYearlyMonthlyEquivalentNgn: plan.yearlyMonthlyEquivalentNgn,
        monthlyPriceNgn,
        yearlyMonthlyEquivalentNgn,
      },
    });

    return updated;
  }
}
