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

export class OnboardingAlreadyCompletedError extends Error {}

@Injectable()
export class CompleteOnboardingUseCase {
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
      throw new ForbiddenError('System actors cannot complete onboarding');
    }

    const onboarding = await this.onboardingRepository.findByTenantId(
      actor.tenantId,
    );

    if (onboarding?.onboardingCompletedAt) {
      throw new OnboardingAlreadyCompletedError('Onboarding already completed');
    }

    if (onboarding) {
      await this.onboardingRepository.save({
        ...onboarding,
        onboardingCompletedAt: new Date(),
        updatedAt: new Date(),
      });
    }

    return {
      status: true,
      message: 'success',
      data: { completedAt: new Date().toISOString() },
    };
  }
}
