import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { runIfLockFree } from "@shared/db";
import { MailerService } from "@shared/mailer";
import { DRIVER_REPOSITORY, type DriverRepository } from "./contexts/fleet/drivers/domain/repositories/driver.repository";
import { REMINDER_LEAD_DAY_OPTIONS } from "./contexts/fleet/maintenance/domain/maintenance-reminder-schedule.repository";
import { getFleetOrm } from "./contexts/fleet/shared/infrastructure/persistence/fleet-orm";
import {
  DRIVER_LICENCE_REMINDER_REPOSITORY,
  type ArmedLicenceReminder,
  type DriverLicenceReminder,
  type DriverLicenceReminderRepository,
} from "./driver-licence-reminders.repository";
import { lagosDayOffset, lagosToday } from "./utils/lagos-date";

const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const LICENCE_REMINDER_LOCK_ID = 8_246_113_070_077;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class DriverLicenceReminderNotFoundError extends Error {
  constructor() {
    super("Driver not found");
  }
}

export class DriverLicenceReminderInputError extends Error {
  constructor(readonly field: string, message: string) {
    super(message);
  }
}

export function toDriverLicenceReminderView(reminder: DriverLicenceReminder) {
  return {
    driverId: reminder.driverId,
    recipientEmail: reminder.recipientEmail,
    leadDays: reminder.leadDays,
    lastSentForExpiry: reminder.sentForExpiry,
    updatedAt: reminder.updatedAt.toISOString(),
  };
}

/** Whether a reminder's mail is due: its expiry is within the lead time, or already past. */
export function isLicenceReminderDue(reminder: Pick<ArmedLicenceReminder, "leadDays" | "licenseExpiryDate">, now: Date): boolean {
  const expiry = reminder.licenseExpiryDate.slice(0, 10);
  return expiry <= lagosDayOffset(reminder.leadDays, now);
}

/**
 * Set Reminder on the driver licence tab: mail one address when a driver's
 * licence is within N days of expiring. Mailed once per expiry date; updating
 * the licence expiry re-arms it.
 */
@Injectable()
export class DriverLicenceRemindersService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DriverLicenceRemindersService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(DRIVER_LICENCE_REMINDER_REPOSITORY) private readonly reminders: DriverLicenceReminderRepository,
    @Inject(DRIVER_REPOSITORY) private readonly drivers: DriverRepository,
    @Inject(MailerService) private readonly mailer: MailerService,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.persistence.backend !== "mikro-orm") return;
    this.timer = setInterval(() => {
      void this.run();
    }, SWEEP_INTERVAL_MS);
    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  list(tenantId: string): Promise<DriverLicenceReminder[]> {
    return this.reminders.listByTenant(tenantId);
  }

  async set(tenantId: string, driverId: string, recipientEmail: unknown, leadDays: unknown, now = new Date()): Promise<DriverLicenceReminder> {
    const email = String(recipientEmail ?? "").trim().toLowerCase();
    if (!EMAIL.test(email) || email.length > 254) throw new DriverLicenceReminderInputError("recipientEmail", "Enter a valid recipient email");
    const days = Number(leadDays);
    if (!(REMINDER_LEAD_DAY_OPTIONS as readonly number[]).includes(days)) {
      throw new DriverLicenceReminderInputError("leadDays", `Remind before must be one of ${REMINDER_LEAD_DAY_OPTIONS.join(", ")} days`);
    }
    if (!(await this.drivers.findById(driverId, tenantId))) throw new DriverLicenceReminderNotFoundError();
    const existing = (await this.reminders.listByTenant(tenantId)).find((r) => r.driverId === driverId);
    const reminder: DriverLicenceReminder = {
      tenantId,
      driverId,
      recipientEmail: email,
      leadDays: days,
      // A changed address or lead time should mail again for the current expiry.
      sentForExpiry: null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await this.reminders.save(reminder);
    return reminder;
  }

  async remove(tenantId: string, driverId: string): Promise<void> {
    await this.reminders.delete(tenantId, driverId);
  }

  async run(now = new Date()): Promise<number> {
    try {
      const orm = await getFleetOrm(this.config.db);
      const result = await runIfLockFree(orm, LICENCE_REMINDER_LOCK_ID, () => this.sendDue(now));
      return result.acquired ? result.value : 0;
    } catch (error) {
      this.logger.error(`driver_licence_reminder_sweep_failed:${(error as Error).message}`);
      return 0;
    }
  }

  async sendDue(now = new Date()): Promise<number> {
    let sent = 0;
    for (const reminder of (await this.reminders.findArmed()).filter((r) => isLicenceReminderDue(r, now))) {
      try {
        await this.mail(reminder, now);
        await this.reminders.markSent(reminder.tenantId, reminder.driverId, reminder.licenseExpiryDate);
        sent += 1;
      } catch (error) {
        this.logger.warn(`driver_licence_reminder_failed:${reminder.tenantId}:${reminder.driverId}:${(error as Error).message}`);
      }
    }
    return sent;
  }

  private async mail(reminder: ArmedLicenceReminder, now: Date): Promise<void> {
    const expiry = reminder.licenseExpiryDate.slice(0, 10);
    const expired = expiry < lagosToday(now);
    await this.mailer.send({
      to: reminder.recipientEmail,
      subject: `${reminder.driverName}'s driver licence ${expired ? "has expired" : "expires soon"} — FleetPro`,
      template: LICENCE_REMINDER_TEMPLATE,
      variables: {
        driverName: escapeHtml(reminder.driverName),
        licenseNumber: escapeHtml(reminder.licenseNumber),
        when: expired ? `expired on ${expiry}` : `expires on ${expiry}`,
        year: String(now.getFullYear()),
      },
    });
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const LICENCE_REMINDER_TEMPLATE = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#f5f5f5; margin:0; padding:24px;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;">
    <div style="background:#1a1a2e;padding:24px;text-align:center;"><h1 style="color:#f5c518;margin:0;font-size:22px;">FleetPro</h1></div>
    <div style="padding:28px;color:#333;">
      <h2 style="margin:0 0 12px;font-size:18px;color:#1a1a2e;">Driver licence renewal</h2>
      <p style="color:#555;font-size:15px;">{{driverName}}'s driver licence ({{licenseNumber}}) {{when}}. Please arrange a renewal.</p>
    </div>
    <div style="padding:18px;text-align:center;color:#aaa;font-size:12px;background:#fafafa;">© {{year}} FleetPro</div>
  </div>
</body>
</html>
`;
