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

export class OnboardingNotFoundForFeaturesError extends Error {}

export type FeatureTogglePayload = {
  liveTracking?: boolean;
  geofencing?: boolean;
  routeOptimization?: boolean;
  messaging?: boolean;
  analytics?: boolean;
  apiAccess?: boolean;
};

@Injectable()
export class SaveFeatureTogglesUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(TENANT_ONBOARDING_REPOSITORY)
    private readonly onboardingRepository: TenantOnboardingRepository,
  ) {}

  async execute(accessToken: string, payload: FeatureTogglePayload) {
    const actor = await resolveActorUser(
      accessToken,
      this.tokenService,
      this.userRepository,
    );
    if (actor.tenantId === 'system') {
      throw new ForbiddenError('System actors cannot save feature toggles');
    }

    const onboarding = await this.onboardingRepository.findByTenantId(
      actor.tenantId,
    );
    if (!onboarding) {
      throw new OnboardingNotFoundForFeaturesError('Onboarding record not found');
    }

    const updated = {
      ...onboarding.features,
      ...(payload.liveTracking !== undefined && { liveTracking: payload.liveTracking }),
      ...(payload.geofencing !== undefined && { geofencing: payload.geofencing }),
      ...(payload.routeOptimization !== undefined && { routeOptimization: payload.routeOptimization }),
      ...(payload.messaging !== undefined && { messaging: payload.messaging }),
      ...(payload.analytics !== undefined && { advancedAnalytics: payload.analytics }),
      ...(payload.apiAccess !== undefined && { apiAccess: payload.apiAccess }),
    };

    await this.onboardingRepository.save({
      ...onboarding,
      features: updated,
      updatedAt: new Date(),
    });

    return { status: true, message: 'success', data: { features: updated } };
  }
}
