import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EVENT_BUS, type EventBus } from '@shared/eventbus';
import type { AlertSeverity, PlatformAlertType } from './platform-alert-settings.repository';

export const SYSTEM_TENANT = 'system';

export type RaisedAlert = {
  alertType: PlatformAlertType;
  severity: AlertSeverity;
  subject: string;
  body: string;
  /** Whatever a reader needs to act on it. Never anything secret. */
  context?: Record<string, unknown>;
};

/**
 * Announces something platform staff should be told about.
 *
 * Publishing is all this does. Who is told, and on which channel, is the alert
 * settings' answer, and the notification service applies it — so a caller
 * raising an alert never has to know a recipient.
 */
@Injectable()
export class PlatformAlertPublisher {
  private readonly logger = new Logger(PlatformAlertPublisher.name);

  constructor(@Inject(EVENT_BUS) private readonly bus: EventBus) {}

  async raise(alert: RaisedAlert): Promise<void> {
    try {
      await this.bus.publish(`tm.${SYSTEM_TENANT}.alert.raised`, {
        id: randomUUID(),
        type: 'alert.raised',
        version: 1,
        occurred_at: new Date().toISOString(),
        tenant_id: SYSTEM_TENANT,
        data: {
          alert_type: alert.alertType,
          severity: alert.severity,
          subject: alert.subject,
          body: alert.body,
          context: alert.context ?? {},
        },
      });
    } catch (error) {
      // Never fails the thing that raised it. An alert is a report about work
      // that already happened, and losing the report is better than undoing it.
      this.logger.warn(
        `alert_publish_failed:${alert.alertType}:${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }
}
