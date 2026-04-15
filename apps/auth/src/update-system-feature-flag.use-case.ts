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

export class SystemFeatureFlagNotFoundError extends Error {
  constructor() {
    super('Feature flag not found');
  }
}

export type UpdateSystemFeatureFlagCommand = {
  accessToken: string;
  featureKey: string;
  isEnabled?: boolean;
  rolloutPercentage?: number;
};

@Injectable()
export class UpdateSystemFeatureFlagUseCase {
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(SYSTEM_FEATURE_FLAG_REPOSITORY)
    private readonly systemFeatureFlagRepository: SystemFeatureFlagRepository,
  ) {}

  async execute(command: UpdateSystemFeatureFlagCommand) {
    await ensureSystemActor(
      command.accessToken,
      this.tokenService,
      this.userRepository,
    );

    const current = await this.systemFeatureFlagRepository.findByFeatureKey(
      command.featureKey,
    );
    if (!current) {
      throw new SystemFeatureFlagNotFoundError();
    }

    const updated: SystemFeatureFlag = {
      ...current,
      isEnabled: command.isEnabled ?? current.isEnabled,
      rolloutPercentage:
        command.rolloutPercentage ?? current.rolloutPercentage,
      updatedAt: new Date(),
    };

    await this.systemFeatureFlagRepository.save(updated);

    return {
      status: true,
      message: 'Feature flag updated successfully',
      data: {
        id: updated.id,
        scope: updated.scope,
        tenantId: updated.tenantId,
        featureKey: updated.featureKey,
        featureName: updated.featureName,
        featureDescription: updated.featureDescription,
        isEnabled: updated.isEnabled,
        rolloutPercentage: updated.rolloutPercentage,
        category: updated.category,
        phase: updated.phase,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    };
  }
}
