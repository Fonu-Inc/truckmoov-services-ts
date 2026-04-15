import { Inject, Injectable } from '@nestjs/common';
import {
  TOKEN_SERVICE,
  USER_REPOSITORY,
} from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import {
  SYSTEM_SETTINGS_REPOSITORY,
  buildDefaultSystemSettings,
  type SystemSettings,
  type SystemSettingsRepository,
} from './system-settings.repository';

@Injectable()
export class GetSystemSettingsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(SYSTEM_SETTINGS_REPOSITORY)
    private readonly systemSettingsRepository: SystemSettingsRepository,
  ) {}

  async execute(accessToken: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository);

    const settings =
      (await this.systemSettingsRepository.get()) ?? buildDefaultSystemSettings();

    return {
      status: true,
      message: 'success',
      data: this.toView(settings),
    };
  }

  private toView(settings: SystemSettings) {
    return {
      platformName: settings.platformName,
      supportEmail: settings.supportEmail,
      defaults: settings.defaults,
      features: settings.features,
      retention: settings.retention,
      updatedAt: settings.updatedAt.toISOString(),
      updatedByUserId: settings.updatedByUserId,
    };
  }
}
