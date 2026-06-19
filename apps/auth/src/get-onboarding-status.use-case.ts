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
  TENANT_ONBOARDING_REPOSITORY,
  type TenantOnboardingRepository,
} from './tenant-onboarding.repository';

@Injectable()
export class GetOnboardingStatusUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
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
      throw new ForbiddenError('System actors do not have onboarding status');
    }

    const onboarding = await this.onboardingRepository.findByTenantId(actor.tenantId);

    const isOnboarded = onboarding?.subscriptionActivatedAt != null;

    let onboardingStatus: 'pending' | 'in_progress' | 'completed' | 'rejected';
    if (!onboarding) {
      onboardingStatus = 'pending';
    } else if (isOnboarded) {
      onboardingStatus = 'completed';
    } else {
      onboardingStatus = 'in_progress';
    }

    return {
      status: true,
      message: 'success',
      data: {
        tenantId: actor.tenantId,
        isOnboarded,
        onboardingStatus,
        planCode: onboarding?.subscription?.planCode ?? null,
        subscriptionStatus: onboarding?.status ?? null,
      },
    };
  }
}
