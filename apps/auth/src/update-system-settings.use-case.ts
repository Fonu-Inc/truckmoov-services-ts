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
  DATE_FORMATS,
  DEFAULT_COMPLIANCE_REMINDER_DAYS,
  DEFAULT_TIME_RANGES,
  SUPPORT_RESPONSE_HOURS,
  TIME_FORMATS,
  isDefaultTimeRange,
  MAX_COMPLIANCE_REMINDER_DAYS,
  SESSION_TIMEOUT_OPTIONS,
  SYSTEM_SETTINGS_REPOSITORY,
  buildDefaultSystemSettings,
  isPlatformCurrency,
  type PlatformCurrency,
  type SystemSettings,
  type SystemSettingsRepository,
} from './system-settings.repository';
import { UnsupportedPlatformCurrencyError } from './platform-currency.errors';

export type UpdateSystemSettingsCommand = {
  accessToken: string;
  platformName?: string;
  supportEmail?: string;
  profile?: {
    contactPhone?: string;
    contactAddress?: string;
    logoUrl?: string | null;
  };
  support?: {
    phone?: string;
    responseTimeHours?: number;
  };
  defaults?: {
    timezone?: string;
    language?: string;
    dateFormat?: string;
    timeFormat?: string;
    defaultTimeRange?: string;
    complianceReminderDays?: number;
    walletTopUpMin?: number;
    walletTopUpMax?: number;
    platformCurrency?: string;
  };
  features?: {
    allowNewTenantRegistration?: boolean;
    maintenanceMode?: boolean;
    enableBetaFeatures?: boolean;
    internationalCurrency?: boolean;
  };
  security?: {
    requireTwoFactor?: boolean;
    sessionTimeoutMinutes?: number;
    auditLogging?: boolean;
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
      profile: {
        contactPhone: command.profile?.contactPhone?.trim() ?? current.profile.contactPhone,
        contactAddress: command.profile?.contactAddress?.trim() ?? current.profile.contactAddress,
        logoUrl: command.profile?.logoUrl !== undefined
          ? resolveLogoUrl(command.profile.logoUrl)
          : current.profile.logoUrl,
      },
      support: {
        phone: command.support?.phone?.trim() ?? current.support.phone,
        responseTimeHours: resolveOneOf(
          'responseTimeHours',
          command.support?.responseTimeHours,
          SUPPORT_RESPONSE_HOURS,
          current.support.responseTimeHours,
        ),
      },
      defaults: {
        timezone: normalizeTimezoneInput(timezoneInput),
        language: command.defaults?.language ?? current.defaults.language,
        dateFormat: resolveOneOf('dateFormat', command.defaults?.dateFormat, DATE_FORMATS, current.defaults.dateFormat),
        timeFormat: resolveOneOf('timeFormat', command.defaults?.timeFormat, TIME_FORMATS, current.defaults.timeFormat),
        defaultTimeRange: resolveTimeRange(
          command.defaults?.defaultTimeRange,
          current.defaults.defaultTimeRange,
        ),
        complianceReminderDays:
          command.defaults?.complianceReminderDays ??
          current.defaults.complianceReminderDays ??
          DEFAULT_COMPLIANCE_REMINDER_DAYS,
        // The interface works in naira; storage stays in kobo like every amount.
        walletTopUpMinKobo:
          command.defaults?.walletTopUpMin !== undefined
            ? Math.round(command.defaults.walletTopUpMin * 100)
            : current.defaults.walletTopUpMinKobo,
        walletTopUpMaxKobo:
          command.defaults?.walletTopUpMax !== undefined
            ? Math.round(command.defaults.walletTopUpMax * 100)
            : current.defaults.walletTopUpMaxKobo,
        platformCurrency: resolvePlatformCurrency(
          command.defaults?.platformCurrency,
          current.defaults.platformCurrency,
        ),
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
        internationalCurrency:
          command.features?.internationalCurrency ??
          current.features.internationalCurrency,
      },
      security: {
        requireTwoFactor:
          command.security?.requireTwoFactor ?? current.security.requireTwoFactor,
        sessionTimeoutMinutes:
          command.security?.sessionTimeoutMinutes ?? current.security.sessionTimeoutMinutes,
        auditLogging: command.security?.auditLogging ?? current.security.auditLogging,
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
    if (!SESSION_TIMEOUT_OPTIONS.includes(merged.security.sessionTimeoutMinutes as never)) {
      throw new InvalidSettingsError(
        `sessionTimeoutMinutes must be one of: ${SESSION_TIMEOUT_OPTIONS.join(', ')}`,
      );
    }
    if (merged.retention.gpsDataRetentionDays < 1) {
      throw new InvalidSettingsError(
        'gpsDataRetentionDays must be greater than 0',
      );
    }
    if (merged.retention.logRetentionDays < 1) {
      throw new InvalidSettingsError('logRetentionDays must be greater than 0');
    }
    if (merged.defaults.walletTopUpMinKobo < 1) {
      throw new InvalidSettingsError('walletTopUpMin must be greater than 0');
    }
    if (merged.defaults.walletTopUpMaxKobo <= merged.defaults.walletTopUpMinKobo) {
      throw new InvalidSettingsError('walletTopUpMax must be greater than walletTopUpMin');
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
        profile: merged.profile,
        support: merged.support,
        defaults: merged.defaults,
        features: merged.features,
        retention: merged.retention,
        security: merged.security,
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

/**
 * Refuses a currency the platform does not support rather than storing it.
 *
 * A rejected value is a visible error. A stored one silently relabels every
 * Naira figure on the platform as something else, because changing this setting
 * does not convert a single stored amount.
 */
function resolvePlatformCurrency(
  requested: string | undefined,
  current: PlatformCurrency,
): PlatformCurrency {
  if (requested === undefined) return current;

  const normalized = requested.trim().toUpperCase();
  if (!isPlatformCurrency(normalized)) {
    throw new UnsupportedPlatformCurrencyError(requested);
  }
  return normalized;
}

function resolveOneOf<T extends string | number>(
  field: string,
  wanted: unknown,
  allowed: readonly T[],
  current: T,
): T {
  if (wanted === undefined) return current;
  if (!allowed.includes(wanted as T)) {
    throw new InvalidSettingsError(`${field} must be one of: ${allowed.join(', ')}`);
  }
  return wanted as T;
}

/** Only an http(s) link is stored: the logo is rendered as an image source. */
function resolveLogoUrl(value: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new InvalidSettingsError('logoUrl must be an http or https link');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new InvalidSettingsError('logoUrl must be an http or https link');
  }
  return url.toString();
}

function resolveTimeRange(
  wanted: string | undefined,
  current: SystemSettings['defaults']['defaultTimeRange'],
): SystemSettings['defaults']['defaultTimeRange'] {
  if (wanted === undefined) return current;
  if (!isDefaultTimeRange(wanted)) {
    throw new InvalidSettingsError(
      `defaultTimeRange must be one of: ${DEFAULT_TIME_RANGES.join(', ')}`,
    );
  }
  return wanted;
}
