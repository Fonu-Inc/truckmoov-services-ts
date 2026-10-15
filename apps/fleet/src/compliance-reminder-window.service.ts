import { Inject, Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { EVENT_BUS, type EventBus, type EventEnvelope } from "@shared/eventbus";

export const DEFAULT_COMPLIANCE_REMINDER_DAYS = 7;
const SYSTEM_SETTINGS_CHANGED_SUBJECT = "tm.system.settings.changed";

/**
 * Holds the platform-wide compliance reminder window, which the auth service
 * owns. It arrives over the event bus rather than by reading auth's tables, so
 * fleet keeps no cross-service database dependency.
 *
 * Until the first event arrives the default applies. A missed event costs a
 * stale window, not a failure, and the next settings change corrects it.
 */
@Injectable()
export class ComplianceReminderWindowService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ComplianceReminderWindowService.name);
  private days = DEFAULT_COMPLIANCE_REMINDER_DAYS;

  constructor(@Inject(EVENT_BUS) private readonly bus: EventBus) {}

  get reminderDays(): number {
    return this.days;
  }

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.bus.subscribeEveryInstance?.(SYSTEM_SETTINGS_CHANGED_SUBJECT, (envelope) =>
        this.apply(envelope),
      );
    } catch (error) {
      this.logger.warn(
        `compliance_reminder_window_subscribe_failed:${(error as Error).message}`,
      );
    }
  }

  private async apply(envelope: EventEnvelope): Promise<void> {
    const value = (envelope.data as Record<string, unknown> | undefined)?.[
      "compliance_reminder_days"
    ];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
      this.logger.warn(`compliance_reminder_window_ignored_value:${String(value)}`);
      return;
    }
    this.days = value;
    this.logger.log(`compliance_reminder_window_updated:${value}`);
  }
}
