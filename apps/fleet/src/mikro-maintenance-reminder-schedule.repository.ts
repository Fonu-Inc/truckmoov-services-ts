import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import {
  getFleetOrm,
  MaintenanceReminderScheduleRecord,
} from "./contexts/fleet/shared/infrastructure/persistence/fleet-orm";
import type {
  MaintenanceReminderSchedule,
  MaintenanceReminderScheduleRepository,
} from "./contexts/fleet/maintenance/domain/maintenance-reminder-schedule.repository";

function toDomain(record: MaintenanceReminderScheduleRecord): MaintenanceReminderSchedule {
  return {
    id: record.id,
    tenantId: record.tenantId,
    recipientEmail: record.recipientEmail,
    leadDays: record.leadDays,
    enabled: record.enabled,
    lastRunAt: record.lastRunAt ?? null,
    lastSentCount: record.lastSentCount ?? null,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

@Injectable()
export class MikroMaintenanceReminderScheduleRepository
  implements MaintenanceReminderScheduleRepository
{
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async save(schedule: MaintenanceReminderSchedule): Promise<void> {
    const em = await this.em();
    const existing = await em.findOne(MaintenanceReminderScheduleRecord, {
      tenantId: schedule.tenantId,
    });
    const target = existing ?? new MaintenanceReminderScheduleRecord();
    Object.assign(target, schedule);
    if (!existing) em.persist(target);
    await em.flush();
  }

  async findByTenantId(tenantId: string): Promise<MaintenanceReminderSchedule | null> {
    const em = await this.em();
    const record = await em.findOne(MaintenanceReminderScheduleRecord, { tenantId });
    return record ? toDomain(record) : null;
  }

  async listEnabled(): Promise<MaintenanceReminderSchedule[]> {
    const em = await this.em();
    const records = await em.find(MaintenanceReminderScheduleRecord, { enabled: true });
    return records.map(toDomain);
  }

  async deleteByTenantId(tenantId: string): Promise<void> {
    const em = await this.em();
    const record = await em.findOne(MaintenanceReminderScheduleRecord, { tenantId });
    if (!record) return;
    em.remove(record);
    await em.flush();
  }

  private async em() {
    const orm = await getFleetOrm(this.config.db);
    return orm.em.fork();
  }
}
