import { Inject, Injectable } from '@nestjs/common';
import { Role } from '@shared/rbac';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import {
  ALERT_CHANNELS,
  ALERT_SEVERITIES,
  PLATFORM_ALERT_SETTINGS_REPOSITORY,
  isPlatformAlertType,
  type AlertChannel,
  type AlertSeverity,
  type PlatformAlertSetting,
  type PlatformAlertSettingsRepository,
} from './platform-alert-settings.repository';

export class UnknownAlertTypeError extends Error {
  constructor(alertType: string) {
    super(`${alertType} is not an alert type`);
  }
}

export class UnknownAlertChannelError extends Error {
  constructor(channel: string) {
    super(`${channel} is not a delivery channel`);
  }
}

export class AlertHasNoRecipientError extends Error {
  constructor() {
    super('An enabled alert needs at least one recipient, or it goes nowhere');
  }
}

/**
 * Platform staff alerting.
 *
 * Held by PLATFORM_ADMIN, the internal system role. This is platform-wide
 * operational configuration, not a tenant's own settings, so no stakeholder
 * role reaches it.
 */
const ALERT_CONFIG_ROLES = new Set<string>([
  Role.PLATFORM_ADMIN,
  Role.SUPER_ADMIN,
  Role.SYSTEM_ADMIN,
]);

export type UpdateAlertSettingCommand = {
  accessToken: string;
  alertType: string;
  enabled?: boolean;
  channels?: string[];
  recipients?: string[];
  minSeverity?: string;
};

@Injectable()
export class PlatformAlertSettingsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(PLATFORM_ALERT_SETTINGS_REPOSITORY)
    private readonly repository: PlatformAlertSettingsRepository,
  ) {}

  async list(accessToken: string): Promise<PlatformAlertSetting[]> {
    await this.requirePlatformAdmin(accessToken);
    return this.repository.findAll();
  }

  async update(command: UpdateAlertSettingCommand): Promise<PlatformAlertSetting> {
    const actor = await this.requirePlatformAdmin(command.accessToken);

    if (!isPlatformAlertType(command.alertType)) {
      throw new UnknownAlertTypeError(command.alertType);
    }

    const existing = await this.repository.findByType(command.alertType);
    const channels = this.normaliseChannels(command.channels) ?? existing?.channels ?? ['email'];
    const recipients = this.normaliseRecipients(command.recipients) ?? existing?.recipients ?? [];
    const enabled = command.enabled ?? existing?.enabled ?? true;

    // Refused rather than saved quietly. An enabled alert with no recipient
    // looks configured on the screen and tells nobody when it fires.
    if (enabled && recipients.length === 0) throw new AlertHasNoRecipientError();

    const setting: PlatformAlertSetting = {
      alertType: command.alertType,
      enabled,
      channels,
      recipients,
      minSeverity: this.normaliseSeverity(command.minSeverity) ?? existing?.minSeverity ?? 'high',
      updatedAt: new Date().toISOString(),
      updatedBy: actor.id,
    };

    await this.repository.save(setting);
    return setting;
  }

  private normaliseChannels(channels?: string[]): AlertChannel[] | null {
    if (!channels) return null;
    for (const channel of channels) {
      if (!ALERT_CHANNELS.includes(channel as AlertChannel)) {
        throw new UnknownAlertChannelError(channel);
      }
    }
    return [...new Set(channels as AlertChannel[])];
  }

  private normaliseRecipients(recipients?: string[]): string[] | null {
    if (!recipients) return null;
    return [
      ...new Set(
        recipients.map((recipient) => recipient.trim().toLowerCase()).filter(Boolean),
      ),
    ];
  }

  private normaliseSeverity(severity?: string): AlertSeverity | null {
    if (!severity) return null;
    return ALERT_SEVERITIES.includes(severity as AlertSeverity)
      ? (severity as AlertSeverity)
      : null;
  }

  private async requirePlatformAdmin(accessToken: string) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (!ALERT_CONFIG_ROLES.has(actor.role)) {
      throw new ForbiddenError('You are not permitted to configure platform alerts');
    }
    return actor;
  }
}
