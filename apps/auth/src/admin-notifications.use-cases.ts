import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { isPlatformActor } from '@shared/identity';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import {
  ADMIN_NOTIFICATION_REPOSITORY,
  type AdminNotificationRepository,
  type AdminNotificationRow,
} from './admin-notification.repository';
import {
  ALERT_SEVERITIES,
  PLATFORM_ALERT_SETTINGS_REPOSITORY,
  isPlatformAlertType,
  type AlertSeverity,
  type PlatformAlertSettingsRepository,
  type PlatformAlertType,
} from './platform-alert-settings.repository';
import { PlatformAlertPublisher } from './platform-alert.publisher';
import { UnknownAlertTypeError } from './platform-alert-settings.use-case';

export class AdminNotificationInputError extends Error {}
export class AdminNotificationNotFoundError extends Error {
  constructor() {
    super('Notification not found');
  }
}
export class NoAlertSwitchedOnError extends Error {
  constructor() {
    super('Switch on at least one alert type before sending a test');
  }
}

export type RecordAdminNotificationInput = {
  eventId: string;
  alertType: string;
  severity: string;
  title: string;
  body?: string;
};

function view(row: AdminNotificationRow) {
  return {
    id: row.id,
    alertType: row.alertType,
    severity: row.severity,
    title: row.title,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
  };
}

@Injectable()
export class AdminNotificationsUseCases {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(ADMIN_NOTIFICATION_REPOSITORY) private readonly notifications: AdminNotificationRepository,
  ) {}

  /** Called by the notification service for an alert routed to `in_app`. Idempotent per event. */
  async record(input: RecordAdminNotificationInput, now = new Date()): Promise<{ recorded: boolean }> {
    if (!input.eventId || input.eventId.length > 64) throw new AdminNotificationInputError('eventId is required');
    if (!isPlatformAlertType(input.alertType)) throw new UnknownAlertTypeError(input.alertType);
    const title = input.title?.trim();
    if (!title) throw new AdminNotificationInputError('title is required');
    const severity: AlertSeverity = ALERT_SEVERITIES.includes(input.severity as AlertSeverity)
      ? (input.severity as AlertSeverity)
      : 'low';
    const recorded = await this.notifications.add({
      id: randomUUID(),
      eventId: input.eventId,
      alertType: input.alertType,
      severity,
      title: title.slice(0, 200),
      body: (input.body ?? '').slice(0, 4000),
      createdAt: now,
    });
    return { recorded };
  }

  async list(accessToken: string, query: { unreadOnly?: boolean; page?: number; limit?: number }) {
    const userId = await this.admin(accessToken);
    const page = Math.max(1, Math.floor(query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Math.floor(query.limit ?? 20)));
    const [{ items, total }, unread] = await Promise.all([
      this.notifications.list(userId, { unreadOnly: query.unreadOnly ?? false, page, limit }),
      this.notifications.countUnread(userId),
    ]);
    return { items: items.map(view), total, unread, page, limit };
  }

  async markRead(accessToken: string, id: string, now = new Date()) {
    const userId = await this.admin(accessToken);
    if (!(await this.notifications.markRead(userId, id, now))) throw new AdminNotificationNotFoundError();
    return { unread: await this.notifications.countUnread(userId) };
  }

  async markAllRead(accessToken: string, now = new Date()) {
    const userId = await this.admin(accessToken);
    const marked = await this.notifications.markAllRead(userId, now);
    return { marked, unread: 0 };
  }

  private async admin(accessToken: string): Promise<string> {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (!isPlatformActor(actor)) throw new ForbiddenError('Not found');
    return actor.id;
  }
}

/** Raises a real alert so staff can see their routing work end to end. */
@Injectable()
export class SendTestAlertUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(PLATFORM_ALERT_SETTINGS_REPOSITORY) private readonly settings: PlatformAlertSettingsRepository,
    @Inject(PlatformAlertPublisher) private readonly alerts: PlatformAlertPublisher,
  ) {}

  async execute(accessToken: string, alertType?: string): Promise<{ alertType: PlatformAlertType; channels: string[] }> {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (!isPlatformActor(actor)) throw new ForbiddenError('Not found');
    if (alertType !== undefined && !isPlatformAlertType(alertType)) throw new UnknownAlertTypeError(alertType);

    const all = await this.settings.findAll();
    const setting = alertType
      ? all.find((s) => s.alertType === alertType && s.enabled)
      : all.find((s) => s.enabled);
    if (!setting) throw new NoAlertSwitchedOnError();

    // Critical so a minimum-severity filter never hides the test.
    await this.alerts.raise({
      alertType: setting.alertType,
      severity: 'critical',
      subject: 'Test alert from FleetPro',
      body: `Sent by ${actor.email} from Settings → Notifications. If you can read this, ${setting.alertType} alerts reach you.`,
      context: { test: true },
    });
    return { alertType: setting.alertType, channels: setting.channels };
  }
}
