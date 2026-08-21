import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EVENT_BUS, type EventBus } from '@shared/eventbus';
import { SYSTEM_TENANT_ID } from './system-authz';
import type { SystemSettings } from './system-settings.repository';

export const SYSTEM_SETTINGS_CHANGED_SUBJECT = 'tm.system.settings.changed';

/**
 * Announces platform settings that other services act on, so they can cache the
 * value instead of reading this service's tables. Publishing is best-effort:
 * a subscriber that misses an event falls back to its own default and picks the
 * new value up on the next change.
 */
@Injectable()
export class SystemSettingsChangedPublisher {
  private readonly logger = new Logger(SystemSettingsChangedPublisher.name);

  constructor(@Inject(EVENT_BUS) private readonly eventBus: EventBus) {}

  async publish(settings: SystemSettings): Promise<void> {
    try {
      await this.eventBus.publish(SYSTEM_SETTINGS_CHANGED_SUBJECT, {
        id: randomUUID(),
        type: 'system.settings.changed',
        version: 1,
        occurred_at: new Date().toISOString(),
        // Platform-wide setting, so it carries the system sentinel rather than
        // a real tenant. The envelope requires the field.
        tenant_id: SYSTEM_TENANT_ID,
        data: {
          compliance_reminder_days: settings.defaults.complianceReminderDays,
          timezone: settings.defaults.timezone,
        },
      });
    } catch (error) {
      this.logger.warn(
        `system_settings_publish_failed:${(error as Error).message}`,
      );
    }
  }
}
