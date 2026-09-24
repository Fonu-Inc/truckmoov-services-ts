import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { SYSTEM_TENANT_ID } from '@shared/identity';
import type { InstallerNotificationPreferences } from '@auth/installation/domain/installer';
import {
  notificationCopy,
  preferencesOf,
  typeToggle,
  type InstallerNotificationType,
  type NotificationCopy,
  type NotifiedDevice,
} from '@auth/installation/domain/installer-notification';
import {
  INSTALLER_NOTIFICATION_REPOSITORY,
  type InstallerNotificationRepository,
} from '@auth/installation/domain/installer-notification.repository';
import type { StoredInstallationOrder } from '@auth/installation/domain/installation-order.repository';
import {
  INSTALLER_REPOSITORY,
  type InstallerRepository,
  type StoredInstaller,
} from '@auth/installation/domain/installer.repository';
import { TenantNotificationPublisher, type TenantNotification } from '../../../../tenant-notification.publisher';

export type InstallerNotice = {
  type: InstallerNotificationType;
  order: StoredInstallationOrder;
  /** Makes the notice unique per order and type: a timestamp or an event id. */
  stamp: string;
  device?: NotifiedDevice;
  reason?: string;
};

export function assignedNotice(order: StoredInstallationOrder, now: Date): InstallerNotice {
  return { type: 'job_assigned', order, stamp: (order.assignedAt ?? now).toISOString() };
}

type Outbound = Pick<TenantNotification, 'channel' | 'recipient' | 'content'>;

function outbound(installer: StoredInstaller, preferences: InstallerNotificationPreferences, copy: NotificationCopy): Outbound[] {
  const sends: Outbound[] = [];
  if (preferences.smsAlerts && installer.phoneNumber) {
    sends.push({ channel: 'sms', recipient: installer.phoneNumber, content: copy.body });
  }
  if (preferences.emailAlerts && installer.email) {
    sends.push({ channel: 'email', recipient: installer.email, content: `${copy.title}\n\n${copy.body}` });
  }
  return sends;
}

/** The inbox row and the SMS/email for one notice, as the installer's toggles allow. Sent under the system tenant. */
@Injectable()
export class InstallerNotifier {
  private readonly logger = new Logger(InstallerNotifier.name);

  constructor(
    @Inject(INSTALLER_REPOSITORY) private readonly installers: InstallerRepository,
    @Inject(INSTALLER_NOTIFICATION_REPOSITORY) private readonly notifications: InstallerNotificationRepository,
    @Inject(TenantNotificationPublisher) private readonly publisher: TenantNotificationPublisher,
  ) {}

  /** Best effort: a failure is logged and never reaches the action that raised it. */
  async notify(notice: InstallerNotice, now: Date = new Date()): Promise<void> {
    try {
      await this.deliver(notice, now);
    } catch (error) {
      this.logger.warn(
        `installer_notification_failed:${notice.type}:${notice.order.id}:${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  /** Throws on failure, so a redelivered event can try again; the dedupe key keeps it to one row. */
  async deliver(notice: InstallerNotice, now: Date = new Date()): Promise<void> {
    const { order } = notice;
    const installer = order.installerId ? await this.installers.findById(order.installerId) : null;
    if (!installer) return;
    const preferences = preferencesOf(installer.notificationPreferences);
    if (!preferences[typeToggle(notice.type)]) return;

    const copy = notificationCopy(notice.type, {
      jobNumber: order.orderNumber,
      scheduledDate: order.scheduledDate,
      timeSlot: order.timeSlot,
      device: notice.device,
      reason: notice.reason,
    });
    const added = await this.notifications.add({
      id: randomUUID(),
      installerId: installer.id,
      type: notice.type,
      ...copy,
      orderId: order.id,
      dedupeKey: `${notice.type}:${order.id}:${notice.stamp}`,
      createdAt: now,
      readAt: null,
    });
    if (!added) return;
    for (const send of outbound(installer, preferences, copy)) {
      await this.publisher.notify({ tenantId: SYSTEM_TENANT_ID, notificationType: notice.type, ...send });
    }
  }
}
