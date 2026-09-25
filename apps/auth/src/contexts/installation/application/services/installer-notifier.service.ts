import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { SYSTEM_TENANT_ID } from '@shared/identity';
import {
  notificationCopy,
  preferencesOf,
  ticketChangeKey,
  ticketUpdateCopy,
  typeToggle,
  type InstallerNotificationType,
  type JobNotificationType,
  type NotificationCopy,
  type NotifiedDevice,
  type TicketChange,
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
import { ticketDisplayId, type StoredSupportTicket } from '../../../../support-ticket.repository';

export type InstallerNotice = {
  type: JobNotificationType;
  order: StoredInstallationOrder;
  /** Makes the notice unique per order and type: a timestamp or an event id. */
  stamp: string;
  device?: NotifiedDevice;
  reason?: string;
};

/** Keyed by installer too: a rejected offer handed on in the same instant still reaches the next one. */
export function assignedNotice(order: StoredInstallationOrder, now: Date): InstallerNotice {
  return { type: 'job_assigned', order, stamp: `${order.installerId}:${(order.assignedAt ?? now).toISOString()}` };
}

type Message = { type: InstallerNotificationType; copy: NotificationCopy; orderId: string | null; dedupeKey: string };

/** Installers get email only; SMS is not sent to them. */
function outbound(installer: StoredInstaller, copy: NotificationCopy): Pick<TenantNotification, 'channel' | 'recipient' | 'content'> {
  return { channel: 'email', recipient: installer.email, content: `${copy.title}\n\n${copy.body}` };
}

/**
 * The inbox row and the email for one notice, as the installer's toggles allow:
 * nothing unless the type's toggle is on, the row shown only with inPlatformAlerts,
 * the email only with emailAlerts. Sent under the system tenant.
 */
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
    await this.quietly(`${notice.type}:${notice.order.id}`, () => this.deliver(notice, now));
  }

  /** Throws on failure, so a redelivered event can try again; the dedupe key keeps it to one row. */
  async deliver(notice: InstallerNotice, now: Date = new Date()): Promise<void> {
    const { order } = notice;
    const installer = order.installerId ? await this.installers.findById(order.installerId) : null;
    if (!installer) return;

    const copy = notificationCopy(notice.type, {
      jobNumber: order.orderNumber,
      scheduledDate: order.scheduledDate,
      timeSlot: order.timeSlot,
      device: notice.device,
      reason: notice.reason,
    });
    const dedupeKey = `${notice.type}:${order.id}:${notice.stamp}`;
    await this.send(installer, { type: notice.type, copy, orderId: order.id, dedupeKey }, now);
  }

  /** Tells the installer who raised the ticket that an admin moved it or replied. Best effort; other tickets are ignored. */
  async notifyTicket(ticket: StoredSupportTicket, change: TicketChange, now: Date = new Date()): Promise<void> {
    if (ticket.reporterType !== 'installer' || !ticket.reporterId) return;
    const reporterId = ticket.reporterId;
    await this.quietly(`support_ticket_updated:${ticket.id}`, async () => {
      const installer = await this.installers.findById(reporterId);
      if (!installer) return;
      const copy = ticketUpdateCopy(ticketDisplayId(ticket.ticketNumber), change);
      const dedupeKey = `support_ticket_updated:${ticketChangeKey(ticket.id, change)}`;
      await this.send(installer, { type: 'support_ticket_updated', copy, orderId: null, dedupeKey }, now);
    });
  }

  /** The row is written either way, hidden without inPlatformAlerts, so its dedupe key also guards the email. */
  private async send(installer: StoredInstaller, message: Message, now: Date): Promise<void> {
    const preferences = preferencesOf(installer.notificationPreferences);
    if (!preferences[typeToggle(message.type)]) return;
    if (!(await this.addRow(installer, message, !preferences.inPlatformAlerts, now))) return;
    if (!preferences.emailAlerts || !installer.email) return;
    await this.publisher.notify({ tenantId: SYSTEM_TENANT_ID, notificationType: message.type, ...outbound(installer, message.copy) });
  }

  /** False when the same notice was already written. */
  private addRow(installer: StoredInstaller, message: Message, hidden: boolean, now: Date): Promise<boolean> {
    return this.notifications.add({
      id: randomUUID(),
      installerId: installer.id,
      type: message.type,
      ...message.copy,
      orderId: message.orderId,
      dedupeKey: message.dedupeKey,
      createdAt: now,
      readAt: hidden ? now : null,
      hidden,
    });
  }

  private async quietly(subject: string, work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (error) {
      this.logger.warn(`installer_notification_failed:${subject}:${error instanceof Error ? error.message : 'unknown'}`);
    }
  }
}
