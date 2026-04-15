import { Inject, Injectable } from '@nestjs/common';
import {
  TOKEN_SERVICE,
  USER_REPOSITORY,
} from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import {
  SYSTEM_FEATURE_FLAG_REPOSITORY,
  type SystemFeatureFlag,
  type SystemFeatureFlagRepository,
} from './system-feature-flag.repository';

@Injectable()
export class ListSystemFeatureFlagsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(SYSTEM_FEATURE_FLAG_REPOSITORY)
    private readonly systemFeatureFlagRepository: SystemFeatureFlagRepository,
  ) {}

  async execute(accessToken: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository);

    const flags = await this.systemFeatureFlagRepository.list();

    return {
      status: true,
      message: 'success',
      data: {
        total: flags.length,
        flags: flags.map((flag) => this.toView(flag)),
        generatedAt: new Date().toISOString(),
      },
    };
  }

  private toView(flag: SystemFeatureFlag) {
    return {
      id: flag.id,
      scope: flag.scope,
      tenantId: flag.tenantId,
      featureKey: flag.featureKey,
      featureName: flag.featureName,
      featureDescription: flag.featureDescription,
      isEnabled: flag.isEnabled,
      rolloutPercentage: flag.rolloutPercentage,
      category: flag.category,
      phase: flag.phase,
      createdAt: flag.createdAt.toISOString(),
      updatedAt: flag.updatedAt.toISOString(),
    };
  }
}
