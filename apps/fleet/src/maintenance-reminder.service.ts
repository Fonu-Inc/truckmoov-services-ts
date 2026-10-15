import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { runIfLockFree } from "@shared/db";
import { MailerService } from "@shared/mailer";
import { sweepSafely } from "@shared/observability";
import { getFleetOrm } from "./contexts/fleet/shared/infrastructure/persistence/fleet-orm";
import {
  MAINTENANCE_REMINDER_SCHEDULE_REPOSITORY,
  type MaintenanceReminderSchedule,
  type MaintenanceReminderScheduleRepository,
} from "./contexts/fleet/maintenance/domain/maintenance-reminder-schedule.repository";
import {
  MAINTENANCE_RECORD_REPOSITORY,
  type MaintenanceRecordRepository,
  type StoredMaintenanceRecord,
} from "./maintenance-record.repository";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAINTENANCE_REMINDER_LOCK_ID = 8_246_113_070_041;
/** Slack for timer drift, so a replica's own next run is never mistaken for a repeat. */
const RERUN_TOLERANCE_MS = 60_000;

export type MaintenanceReminderDue = {
  vehicleId: string;
  maintenanceType: string;
  status: string;
  priority: string;
  scheduledDate: string | null;
  daysUntilDue: number | null;
};

@Injectable()
export class MaintenanceReminderService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(MaintenanceReminderService.name);
  private readonly sweepIntervalMs: number;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(MAINTENANCE_REMINDER_SCHEDULE_REPOSITORY)
    private readonly schedules: MaintenanceReminderScheduleRepository,
    @Inject(MAINTENANCE_RECORD_REPOSITORY)
    private readonly records: MaintenanceRecordRepository,
    @Inject(MailerService) private readonly mailer: MailerService,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {
    this.sweepIntervalMs = config.fleet.maintenanceReminderSweepHours * 3_600_000;
  }

  onApplicationBootstrap(): void {
    this.timer = setInterval(
      () => sweepSafely(this.logger, "maintenance_reminder", () => this.sweep()),
      this.sweepIntervalMs,
    );
    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Walks every enabled schedule and mails the tenant's own due and overdue
   * maintenance. Each tenant is read and sent separately: one tenant's failure
   * must not stop another's reminder, and no email may ever carry two tenants'
   * vehicles.
   */
  async sweep(now: Date = new Date()): Promise<void> {
    if (this.config.persistence.backend !== "mikro-orm") return this.sweepAll(now);
    const orm = await getFleetOrm(this.config.db);
    await runIfLockFree(orm, MAINTENANCE_REMINDER_LOCK_ID, () => this.sweepAll(now));
  }

  private async sweepAll(now: Date): Promise<void> {
    let schedules: MaintenanceReminderSchedule[];
    try {
      schedules = await this.schedules.listEnabled();
    } catch (error) {
      this.logger.error(`reminder sweep could not read schedules: ${message(error)}`);
      return;
    }

    for (const schedule of schedules) {
      // Every replica's timer fires on its own clock; the lock only stops them overlapping.
      if (this.ranThisPeriod(schedule, now)) continue;
      try {
        await this.runForTenant(schedule, now);
      } catch (error) {
        this.logger.warn(`reminder sweep failed for tenant ${schedule.tenantId}: ${message(error)}`);
      }
    }
  }

  private ranThisPeriod(schedule: MaintenanceReminderSchedule, now: Date): boolean {
    if (!schedule.lastRunAt) return false;
    return now.getTime() - schedule.lastRunAt.getTime() < this.sweepIntervalMs - RERUN_TOLERANCE_MS;
  }

  async runForTenant(
    schedule: MaintenanceReminderSchedule,
    now: Date = new Date(),
  ): Promise<MaintenanceReminderDue[]> {
    const due = await this.findDue(schedule, now);

    if (due.length > 0) {
      await this.mailer.send({
        to: schedule.recipientEmail,
        subject: `${due.length} vehicle(s) need maintenance attention — TruckMoov`,
        template: MAINTENANCE_REMINDER_TEMPLATE,
        variables: {
          leadDays: String(schedule.leadDays),
          dueCount: String(due.length),
          rows: due.map(renderRow).join(""),
          year: String(now.getFullYear()),
        },
      });
    }

    await this.schedules.save({
      ...schedule,
      lastRunAt: now,
      lastSentCount: due.length,
      updatedAt: now,
    });

    return due;
  }

  async findDue(
    schedule: MaintenanceReminderSchedule,
    now: Date = new Date(),
  ): Promise<MaintenanceReminderDue[]> {
    const records = await this.records.findAllByTenant(schedule.tenantId);
    const horizon = now.getTime() + schedule.leadDays * DAY_MS;

    return records
      .filter((record) => isOutstanding(record))
      .map((record) => toDue(record, now))
      .filter((entry) => {
        if (entry.scheduledDate === null) return false;
        const scheduled = Date.parse(entry.scheduledDate);
        // Overdue work is always included: a reminder window is about how much
        // notice you want, not about forgetting what is already late.
        return Number.isFinite(scheduled) && scheduled <= horizon;
      })
      .sort((a, b) => (a.daysUntilDue ?? 0) - (b.daysUntilDue ?? 0));
  }
}

function isOutstanding(record: StoredMaintenanceRecord): boolean {
  return record.status !== "completed" && record.status !== "cancelled";
}

function toDue(record: StoredMaintenanceRecord, now: Date): MaintenanceReminderDue {
  const scheduled = record.scheduledDate ? Date.parse(record.scheduledDate) : Number.NaN;
  return {
    vehicleId: record.vehicleId,
    maintenanceType: record.maintenanceType,
    status: record.status,
    priority: record.priority,
    scheduledDate: record.scheduledDate,
    daysUntilDue: Number.isFinite(scheduled)
      ? Math.ceil((scheduled - now.getTime()) / DAY_MS)
      : null,
  };
}

function renderRow(entry: MaintenanceReminderDue): string {
  const when =
    entry.daysUntilDue === null
      ? "unscheduled"
      : entry.daysUntilDue < 0
        ? `${Math.abs(entry.daysUntilDue)} day(s) overdue`
        : `due in ${entry.daysUntilDue} day(s)`;
  return `<tr><td>${entry.vehicleId}</td><td>${entry.maintenanceType}</td><td>${entry.priority}</td><td>${when}</td></tr>`;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

const MAINTENANCE_REMINDER_TEMPLATE = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#f5f5f5; margin:0; padding:24px;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;">
    <div style="background:#1a1a2e;padding:24px;text-align:center;"><h1 style="color:#f5c518;margin:0;font-size:22px;">TruckMoov</h1></div>
    <div style="padding:28px;color:#333;">
      <h2 style="margin:0 0 12px;font-size:18px;color:#1a1a2e;">Maintenance due</h2>
      <p style="color:#555;font-size:15px;">{{dueCount}} vehicle(s) have maintenance due within {{leadDays}} days, or already overdue.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead><tr style="text-align:left;color:#888;"><th>Vehicle</th><th>Type</th><th>Priority</th><th>When</th></tr></thead>
        <tbody>{{rows}}</tbody>
      </table>
    </div>
    <div style="padding:18px;text-align:center;color:#aaa;font-size:12px;background:#fafafa;">© {{year}} TruckMoov</div>
  </div>
</body>
</html>
`;
