import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import {
  getFleetOrm,
  GeofenceZoneRecord,
  GeofenceAssignmentRecord,
} from "./contexts/fleet/shared/infrastructure/persistence/fleet-orm";
import type {
  GeofenceZoneFilters,
  GeofenceZoneRepository,
  StoredGeofenceZone,
} from "./geofence-zone.repository";

@Injectable()
export class MikroGeofenceZoneRepository implements GeofenceZoneRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  private async enrichWithAssignments(orm: Awaited<ReturnType<typeof getFleetOrm>>, zones: GeofenceZoneRecord[]): Promise<StoredGeofenceZone[]> {
    if (!zones.length) return [];
    const em = orm.em.fork();
    const zoneIds = zones.map((z) => z.id);
    const assignments = await em.find(GeofenceAssignmentRecord, { zoneId: { $in: zoneIds } });
    const byZone = new Map<string, string[]>();
    for (const a of assignments) {
      const list = byZone.get(a.zoneId) ?? [];
      list.push(a.vehicleId);
      byZone.set(a.zoneId, list);
    }
    return zones.map((z) => ({
      ...(z as unknown as StoredGeofenceZone),
      assignedVehicleIds: byZone.get(z.id) ?? [],
    }));
  }

  async save(zone: StoredGeofenceZone): Promise<void> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const { assignedVehicleIds: _, ...record } = zone;
    await em.upsert(GeofenceZoneRecord, record as unknown as GeofenceZoneRecord);
  }

  async findById(id: string, tenantId: string): Promise<StoredGeofenceZone | null> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(GeofenceZoneRecord, { id, tenantId });
    if (!record) return null;
    const [enriched] = await this.enrichWithAssignments(orm, [record]);
    return enriched;
  }

  async findAllByTenant(tenantId: string, filters?: GeofenceZoneFilters): Promise<StoredGeofenceZone[]> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const records = await em.find(GeofenceZoneRecord, {
      tenantId,
      ...(filters?.status ? { status: filters.status } : { status: "ACTIVE" }),
    });
    return this.enrichWithAssignments(orm, records);
  }

  async deleteById(id: string, tenantId: string): Promise<void> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    await em.nativeDelete(GeofenceAssignmentRecord, { zoneId: id, tenantId });
    await em.nativeDelete(GeofenceZoneRecord, { id, tenantId });
  }

  async setVehicleAssignments(zoneId: string, tenantId: string, vehicleIds: string[]): Promise<void> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    await em.nativeDelete(GeofenceAssignmentRecord, { zoneId });
    for (const vehicleId of vehicleIds) {
      await em.upsert(GeofenceAssignmentRecord, { zoneId, vehicleId, tenantId, createdAt: new Date() });
    }
  }
}
