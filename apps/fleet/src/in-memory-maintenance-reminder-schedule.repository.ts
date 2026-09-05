import { Injectable } from "@nestjs/common";
import type {
  MaintenanceReminderSchedule,
  MaintenanceReminderScheduleRepository,
} from "./contexts/fleet/maintenance/domain/maintenance-reminder-schedule.repository";

@Injectable()
export class InMemoryMaintenanceReminderScheduleRepository
  implements MaintenanceReminderScheduleRepository
{
  private readonly schedules = new Map<string, MaintenanceReminderSchedule>();

  async save(schedule: MaintenanceReminderSchedule): Promise<void> {
    this.schedules.set(schedule.tenantId, { ...schedule });
  }

  async findByTenantId(tenantId: string): Promise<MaintenanceReminderSchedule | null> {
    return this.schedules.get(tenantId) ?? null;
  }

  async listEnabled(): Promise<MaintenanceReminderSchedule[]> {
    return [...this.schedules.values()].filter((schedule) => schedule.enabled);
  }

  async deleteByTenantId(tenantId: string): Promise<void> {
    this.schedules.delete(tenantId);
  }
}
