import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EVENT_BUS, type EventBus } from '@shared/eventbus';

export type TenantNotification = {
  tenantId: string;
  recipient: string;
  channel: 'email' | 'sms' | 'whatsapp';
  content: string;
  notificationType: string;
};

/**
 * Tells one person something about their own organisation.
 *
 * Distinct from a platform alert: the recipient is known here, because it is
 * the person the thing happened to. Platform alerts have no recipient at the
 * point they are raised — the settings decide.
 */
@Injectable()
export class TenantNotificationPublisher {
  private readonly logger = new Logger(TenantNotificationPublisher.name);

  constructor(@Inject(EVENT_BUS) private readonly bus: EventBus) {}

  async notify(notification: TenantNotification): Promise<void> {
    try {
      await this.bus.publish(`tm.${notification.tenantId}.notification.send`, {
        id: randomUUID(),
        type: 'notification.send',
        version: 1,
        occurred_at: new Date().toISOString(),
        tenant_id: notification.tenantId,
        data: {
          recipient: notification.recipient,
          channel: notification.channel,
          content: notification.content,
          notification_type: notification.notificationType,
        },
      });
    } catch (error) {
      this.logger.warn(
        `tenant_notification_failed:${notification.tenantId}:${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }
}
