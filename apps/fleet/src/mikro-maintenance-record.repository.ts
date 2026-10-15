import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { getFleetOrm, MaintenanceRecordOrmRecord } from "./contexts/fleet/shared/infrastructure/persistence/fleet-orm";
import type {
  MaintenanceRecordFilters,
  MaintenanceRecordRepository,
  StoredMaintenanceRecord,
} from "./maintenance-record.repository";
import { lagosToday } from "./utils/lagos-date";

@Injectable()
export class MikroMaintenanceRecordRepository implements MaintenanceRecordRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async save(record: StoredMaintenanceRecord): Promise<void> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    // Map ONLY real columns explicitly — em.upsert introspects the object's
    // own keys to build the SQL, so any extra field (e.g. the response-only
    // vehiclePlateNumber/vehicleRegistrationNumber enrichment) would emit a
    // phantom column and fail with "column ... does not exist".
    const row: MaintenanceRecordOrmRecord = {
      id: record.id,
      tenantId: record.tenantId,
      vehicleId: record.vehicleId,
      maintenanceType: record.maintenanceType,
      description: record.description,
      status: record.status,
      priority: record.priority,
      scheduledDate: record.scheduledDate,
      completedDate: record.completedDate,
      cost: record.cost,
      currency: record.currency,
      technician: record.technician,
      notes: record.notes,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
    await em.upsert(MaintenanceRecordOrmRecord, row);
  }

  async findById(id: string, tenantId: string): Promise<StoredMaintenanceRecord | null> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const rec = await em.findOne(MaintenanceRecordOrmRecord, { id, tenantId });
    return rec ? (rec as unknown as StoredMaintenanceRecord) : null;
  }

  async findAllByTenant(tenantId: string, filters?: MaintenanceRecordFilters): Promise<StoredMaintenanceRecord[]> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const where: Record<string, unknown> = { tenantId };
    if (filters?.vehicleId) where.vehicleId = filters.vehicleId;
    if (filters?.priority) where.priority = filters.priority;
    if (filters?.maintenanceType) where.maintenanceType = filters.maintenanceType;
    const isOverdueFilter = filters?.status === "overdue";
    if (filters?.status && !isOverdueFilter) where.status = filters.status;
    const records = await em.find(MaintenanceRecordOrmRecord, where as any);
    let result = records as unknown as StoredMaintenanceRecord[];
    const today = lagosToday();
    if (isOverdueFilter) {
      result = result.filter((r) => (r.scheduledDate ?? "") < today && r.status === "scheduled");
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      result = result.filter((r) =>
        r.maintenanceType.toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q) ||
        (r.technician ?? "").toLowerCase().includes(q),
      );
    }
    if (filters?.costMin != null) result = result.filter((r) => (r.cost ?? 0) >= filters.costMin!);
    if (filters?.costMax != null) result = result.filter((r) => (r.cost ?? 0) <= filters.costMax!);
    return result;
  }

  async deleteById(id: string, tenantId: string): Promise<void> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    await em.nativeDelete(MaintenanceRecordOrmRecord, { id, tenantId });
  }
}
