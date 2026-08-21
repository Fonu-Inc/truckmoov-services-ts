import { Inject, Injectable } from '@nestjs/common';
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
import {
  TENANT_ONBOARDING_REPOSITORY,
  type TenantOnboardingRepository,
} from './tenant-onboarding.repository';

@Injectable()
export class GetSubscriptionCapsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SUBSCRIPTION_PLAN_REPOSITORY)
    private readonly planRepository: SubscriptionPlanRepository,
    @Inject(TENANT_ONBOARDING_REPOSITORY)
    private readonly onboardingRepository: TenantOnboardingRepository,
  ) {}

  async execute(accessToken: string) {
    const actor = await resolveActorUser(
      accessToken,
      this.tokenService,
      this.userRepository,
    );
    if (actor.tenantId === 'system') {
      throw new ForbiddenError('System actors do not have subscription caps');
    }

    const onboarding = await this.onboardingRepository.findByTenantId(
      actor.tenantId,
    );
    if (!onboarding) {
      return {
        status: true,
        message: 'success',
        data: {
          planCode: null,
          planName: null,
          planTier: null,
          maxActiveVehicles: null,
          maxDevices: null,
          maxSims: null,
          maxUsers: null,
          subscriptionActivatedAt: null,
        },
      };
    }

    const plan = await this.planRepository.findByCode(
      onboarding.subscription.planCode,
    );

    return {
      status: true,
      message: 'success',
      data: {
        planCode: plan?.code ?? onboarding.subscription.planCode,
        planName: plan?.name ?? null,
        planTier: plan?.tier ?? null,
        // Plans carry no device or SIM cap of their own. Aliasing the vehicle
        // cap here silently capped SIMs at the vehicle count, so report the
        // absence instead until real caps exist on the plan.
        maxActiveVehicles: plan?.maxActiveVehicles ?? null,
        maxDevices: null,
        maxSims: null,
        maxUsers: plan?.maxUsers ?? null,
        subscriptionActivatedAt: onboarding.subscriptionActivatedAt ?? null,
      },
    };
  }
}
