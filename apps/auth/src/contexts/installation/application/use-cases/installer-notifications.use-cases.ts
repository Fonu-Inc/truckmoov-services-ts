import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE } from '@auth/session';
import type { TokenService } from '@auth/session/domain/ports/token-service.port';
import { OnboardingValidationError } from '@auth/onboarding/domain/onboarding-application.validation';
import type { InstallerNotificationPreferences } from '@auth/installation/domain/installer';
import {
  InstallerNotificationNotFoundError,
  NOTIFICATION_TOGGLES,
  preferencesOf,
} from '@auth/installation/domain/installer-notification';
import {
  INSTALLER_NOTIFICATION_REPOSITORY,
  type InstallerNotificationRepository,
  type InstallerNotificationRow,
} from '@auth/installation/domain/installer-notification.repository';
import {
  INSTALLER_REPOSITORY,
  type InstallerRepository,
  type StoredInstaller,
} from '@auth/installation/domain/installer.repository';
import { currentInstaller } from './support/current-installer';
import { pageOf } from './support/paging';

export type NotificationListQuery = { unread?: boolean; page?: number; limit?: number };
export type PreferencesChange = Partial<Record<keyof InstallerNotificationPreferences, unknown>>;

function toNotificationView(row: InstallerNotificationRow) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    jobId: row.orderId,
    jobNumber: row.jobNumber,
    createdAt: row.createdAt.toISOString(),
    read: row.readAt !== null,
  };
}

function changedToggles(change: PreferencesChange): Partial<InstallerNotificationPreferences> {
  const entries = NOTIFICATION_TOGGLES.flatMap((toggle) => {
    const value = change[toggle];
    if (value === undefined) return [];
    if (typeof value !== 'boolean') throw new OnboardingValidationError(toggle, `${toggle} must be true or false`);
    return [[toggle, value] as const];
  });
  if (entries.length === 0) throw new OnboardingValidationError('body', 'Nothing to change');
  return Object.fromEntries(entries);
}

/** The installer's own inbox and notification toggles. Another installer's notification answers as a missing one. */
@Injectable()
export class InstallerNotificationsUseCases {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(INSTALLER_REPOSITORY) private readonly installers: InstallerRepository,
    @Inject(INSTALLER_NOTIFICATION_REPOSITORY) private readonly notifications: InstallerNotificationRepository,
  ) {}

  async list(accessToken: string, query: NotificationListQuery) {
    const installer = await this.installer(accessToken);
    const { page, limit } = pageOf(query);
    const [found, unreadCount] = await Promise.all([
      this.notifications.list(installer.id, { unreadOnly: query.unread === true, page, limit }),
      this.notifications.countUnread(installer.id),
    ]);
    return { unreadCount, items: found.items.map(toNotificationView), page, limit, total: found.total };
  }

  async markRead(accessToken: string, id: string, now: Date = new Date()) {
    const installer = await this.installer(accessToken);
    if (!(await this.notifications.markRead(installer.id, id, now))) throw new InstallerNotificationNotFoundError();
    return { id, read: true, unreadCount: await this.notifications.countUnread(installer.id) };
  }

  async markAllRead(accessToken: string, now: Date = new Date()) {
    const installer = await this.installer(accessToken);
    return { updated: await this.notifications.markAllRead(installer.id, now), unreadCount: 0 };
  }

  async preferences(accessToken: string): Promise<InstallerNotificationPreferences> {
    return preferencesOf((await this.installer(accessToken)).notificationPreferences);
  }

  async updatePreferences(accessToken: string, change: PreferencesChange): Promise<InstallerNotificationPreferences> {
    const installer = await this.installer(accessToken);
    const preferences = { ...preferencesOf(installer.notificationPreferences), ...changedToggles(change) };
    await this.installers.save({ ...installer, notificationPreferences: preferences, updatedAt: new Date() });
    return preferences;
  }

  private installer(accessToken: string): Promise<StoredInstaller> {
    return currentInstaller({ tokens: this.tokens, installers: this.installers }, accessToken);
  }
}
