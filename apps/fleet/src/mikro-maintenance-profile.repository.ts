import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { getFleetOrm, MaintenanceProfileRecord } from "./contexts/fleet/shared/infrastructure/persistence/fleet-orm";
import type {
  MaintenanceProfileFilters,
  MaintenanceProfileRepository,
  StoredMaintenanceProfile,
} from "./maintenance-profile.repository";

function toStored(record: MaintenanceProfileRecord): StoredMaintenanceProfile {
  return record as unknown as StoredMaintenanceProfile;
}

@Injectable()
export class MikroMaintenanceProfileRepository implements MaintenanceProfileRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async save(profile: StoredMaintenanceProfile): Promise<void> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(MaintenanceProfileRecord, profile as unknown as MaintenanceProfileRecord);
  }

  async findById(id: string): Promise<StoredMaintenanceProfile | null> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(MaintenanceProfileRecord, { id });
    return record ? toStored(record) : null;
  }

  async findAllByTenant(tenantId: string, filters?: MaintenanceProfileFilters): Promise<StoredMaintenanceProfile[]> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const records = await em.find(MaintenanceProfileRecord, {
      tenantId,
      ...(filters?.vehicleId ? { vehicleId: filters.vehicleId } : {}),
    });
    let result = records.map(toStored);
    if (filters?.nextDueDateFrom) result = result.filter((r) => (r.nextDueDate ?? "") >= filters.nextDueDateFrom!);
    if (filters?.nextDueDateTo) result = result.filter((r) => (r.nextDueDate ?? "") <= filters.nextDueDateTo!);
    if (filters?.currentMileageMin != null) result = result.filter((r) => (r.currentMileage ?? 0) >= filters.currentMileageMin!);
    if (filters?.currentMileageMax != null) result = result.filter((r) => (r.currentMileage ?? 0) <= filters.currentMileageMax!);
    return result;
  }

  async deleteById(id: string): Promise<void> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    await em.nativeDelete(MaintenanceProfileRecord, { id });
  }
}
