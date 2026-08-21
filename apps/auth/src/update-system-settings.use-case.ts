import { Inject, Injectable } from '@nestjs/common';
import {
  TOKEN_SERVICE,
  USER_REPOSITORY,
} from './contexts/auth/session';
import { InvalidSettingsError } from './contexts/auth/session/domain/errors/invalid-settings.error';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { assertValidTimezone } from './contexts/auth/session/application/use-cases/support/settings-validation';
import { ensureSystemActor } from './system-authz';
import { SystemSettingsChangedPublisher } from './system-settings-changed.publisher';
import {
  DEFAULT_COMPLIANCE_REMINDER_DAYS,
  MAX_COMPLIANCE_REMINDER_DAYS,
  SYSTEM_SETTINGS_REPOSITORY,
  buildDefaultSystemSettings,
  type SystemSettings,
  type SystemSettingsRepository,
} from './system-settings.repository';

export type UpdateSystemSettingsCommand = {
  accessToken: string;
  platformName?: string;
  supportEmail?: string;
  defaults?: {
    timezone?: string;
    language?: string;
    complianceReminderDays?: number;
  };
  features?: {
    allowNewTenantRegistration?: boolean;
    maintenanceMode?: boolean;
    enableBetaFeatures?: boolean;
  };
  retention?: {
    gpsDataRetentionDays?: number;
    logRetentionDays?: number;
    backupFrequency?: 'hourly' | 'daily' | 'weekly';
  };
};

@Injectable()
export class UpdateSystemSettingsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(SYSTEM_SETTINGS_REPOSITORY)
    private readonly systemSettingsRepository: SystemSettingsRepository,
    @Inject(SystemSettingsChangedPublisher)
    private readonly systemSettingsChangedPublisher: SystemSettingsChangedPublisher,
  ) {}

  async execute(command: UpdateSystemSettingsCommand) {
    const actor = await ensureSystemActor(
      command.accessToken,
      this.tokenService,
      this.userRepository,
    );

    const current =
      (await this.systemSettingsRepository.get()) ?? buildDefaultSystemSettings();
    const timezoneInput = command.defaults?.timezone ?? current.defaults.timezone;
    const merged: SystemSettings = {
      ...current,
      platformName: command.platformName ?? current.platformName,
      supportEmail: command.supportEmail ?? current.supportEmail,
      defaults: {
        timezone: normalizeTimezoneInput(timezoneInput),
        language: command.defaults?.language ?? current.defaults.language,
        complianceReminderDays:
          command.defaults?.complianceReminderDays ??
          current.defaults.complianceReminderDays ??
          DEFAULT_COMPLIANCE_REMINDER_DAYS,
      },
      features: {
        allowNewTenantRegistration:
          command.features?.allowNewTenantRegistration ??
          current.features.allowNewTenantRegistration,
        maintenanceMode:
          command.features?.maintenanceMode ?? current.features.maintenanceMode,
        enableBetaFeatures:
          command.features?.enableBetaFeatures ??
          current.features.enableBetaFeatures,
      },
      retention: {
        gpsDataRetentionDays:
          command.retention?.gpsDataRetentionDays ??
          current.retention.gpsDataRetentionDays,
        logRetentionDays:
          command.retention?.logRetentionDays ??
          current.retention.logRetentionDays,
        backupFrequency:
          command.retention?.backupFrequency ??
          current.retention.backupFrequency,
      },
      updatedAt: new Date(),
      updatedByUserId: actor.id,
    };

    assertValidTimezone(merged.defaults.timezone);
    if (merged.retention.gpsDataRetentionDays < 1) {
      throw new InvalidSettingsError(
        'gpsDataRetentionDays must be greater than 0',
      );
    }
    if (merged.retention.logRetentionDays < 1) {
      throw new InvalidSettingsError('logRetentionDays must be greater than 0');
    }
    if (
      !Number.isInteger(merged.defaults.complianceReminderDays) ||
      merged.defaults.complianceReminderDays < 1 ||
      merged.defaults.complianceReminderDays > MAX_COMPLIANCE_REMINDER_DAYS
    ) {
      throw new InvalidSettingsError(
        `complianceReminderDays must be a whole number between 1 and ${MAX_COMPLIANCE_REMINDER_DAYS}`,
      );
    }

    await this.systemSettingsRepository.save(merged);
    await this.systemSettingsChangedPublisher.publish(merged);

    return {
      status: true,
      message: 'System settings updated successfully',
      data: {
        platformName: merged.platformName,
        supportEmail: merged.supportEmail,
        defaults: merged.defaults,
        features: merged.features,
        retention: merged.retention,
        updatedAt: merged.updatedAt.toISOString(),
        updatedByUserId: merged.updatedByUserId,
      },
    };
  }
}

function normalizeTimezoneInput(timezone: string): string {
  const trimmed = timezone.trim();
  if (!trimmed.includes('/')) {
    return trimmed.toUpperCase() === 'UTC' ? 'UTC' : trimmed;
  }

  return trimmed
    .split('/')
    .map((segment) =>
      segment
        .split('_')
        .map((part) =>
          part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part,
        )
        .join('_'),
    )
    .join('/');
}
