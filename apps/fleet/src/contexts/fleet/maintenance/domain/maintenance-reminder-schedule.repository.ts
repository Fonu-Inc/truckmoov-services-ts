export const REMINDER_LEAD_DAY_OPTIONS = [7, 14, 30, 60, 90] as const;
export type ReminderLeadDays = (typeof REMINDER_LEAD_DAY_OPTIONS)[number];

export type MaintenanceReminderSchedule = {
  id: string;
  tenantId: string;
  recipientEmail: string;
  leadDays: number;
  enabled: boolean;
  lastRunAt: Date | null;
  lastSentCount: number | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export interface MaintenanceReminderScheduleRepository {
  save(schedule: MaintenanceReminderSchedule): Promise<void>;
  findByTenantId(tenantId: string): Promise<MaintenanceReminderSchedule | null>;
  /** Every enabled schedule across tenants, for the sweep. */
  listEnabled(): Promise<MaintenanceReminderSchedule[]>;
  deleteByTenantId(tenantId: string): Promise<void>;
}

export const MAINTENANCE_REMINDER_SCHEDULE_REPOSITORY = Symbol(
  "MAINTENANCE_REMINDER_SCHEDULE_REPOSITORY",
);
