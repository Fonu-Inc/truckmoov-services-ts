import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { getFleetOrm } from "./contexts/fleet/shared/infrastructure/persistence/fleet-orm";

export type DriverLicenceReminder = {
  tenantId: string;
  driverId: string;
  recipientEmail: string;
  leadDays: number;
  /** The expiry date the last mail was about; a new expiry re-arms the reminder. */
  sentForExpiry: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** A reminder whose driver's current expiry has not been mailed about yet. */
export type ArmedLicenceReminder = DriverLicenceReminder & {
  driverName: string;
  licenseNumber: string;
  licenseExpiryDate: string;
};

export interface DriverLicenceReminderRepository {
  listByTenant(tenantId: string): Promise<DriverLicenceReminder[]>;
  save(reminder: DriverLicenceReminder): Promise<void>;
  delete(tenantId: string, driverId: string): Promise<void>;
  findArmed(): Promise<ArmedLicenceReminder[]>;
  markSent(tenantId: string, driverId: string, expiry: string): Promise<void>;
}

export const DRIVER_LICENCE_REMINDER_REPOSITORY = Symbol("DRIVER_LICENCE_REMINDER_REPOSITORY");

type Row = Record<string, unknown>;

function toReminder(row: Row): DriverLicenceReminder {
  return {
    tenantId: String(row.tenant_id),
    driverId: String(row.driver_id),
    recipientEmail: String(row.recipient_email),
    leadDays: Number(row.lead_days),
    sentForExpiry: row.sent_for_expiry == null ? null : String(row.sent_for_expiry),
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

@Injectable()
export class MikroDriverLicenceReminderRepository implements DriverLicenceReminderRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async listByTenant(tenantId: string): Promise<DriverLicenceReminder[]> {
    const rows = await (await this.connection()).execute<Row[]>(
      `select * from driver_licence_reminders where tenant_id = ? order by created_at`,
      [tenantId],
    );
    return rows.map(toReminder);
  }

  async save(reminder: DriverLicenceReminder): Promise<void> {
    await (await this.connection()).execute(
      `insert into driver_licence_reminders (tenant_id, driver_id, recipient_email, lead_days, sent_for_expiry, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?)
       on conflict (tenant_id, driver_id) do update set recipient_email = excluded.recipient_email,
         lead_days = excluded.lead_days, sent_for_expiry = excluded.sent_for_expiry, updated_at = excluded.updated_at`,
      [
        reminder.tenantId,
        reminder.driverId,
        reminder.recipientEmail,
        reminder.leadDays,
        reminder.sentForExpiry,
        reminder.createdAt,
        reminder.updatedAt,
      ],
    );
  }

  async delete(tenantId: string, driverId: string): Promise<void> {
    await (await this.connection()).execute(
      `delete from driver_licence_reminders where tenant_id = ? and driver_id = ?`,
      [tenantId, driverId],
    );
  }

  async findArmed(): Promise<ArmedLicenceReminder[]> {
    const rows = await (await this.connection()).execute<Row[]>(
      `select r.*, d.name as driver_name, d.license_number, d.license_expiry_date
       from driver_licence_reminders r
       join fleet_drivers d on d.id = r.driver_id and d.tenant_id = r.tenant_id
       where d.license_expiry_date is not null and r.sent_for_expiry is distinct from d.license_expiry_date`,
    );
    return rows.map((row) => ({
      ...toReminder(row),
      driverName: String(row.driver_name),
      licenseNumber: String(row.license_number),
      licenseExpiryDate: String(row.license_expiry_date),
    }));
  }

  async markSent(tenantId: string, driverId: string, expiry: string): Promise<void> {
    await (await this.connection()).execute(
      `update driver_licence_reminders set sent_for_expiry = ?, updated_at = now() where tenant_id = ? and driver_id = ?`,
      [expiry, tenantId, driverId],
    );
  }

  private async connection() {
    return (await getFleetOrm(this.config.db)).em.fork().getConnection();
  }
}
