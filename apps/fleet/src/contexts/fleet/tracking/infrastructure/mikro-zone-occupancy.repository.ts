import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import {
  getFleetOrm,
  ZoneOccupancyRecord,
} from "../../shared/infrastructure/persistence/fleet-orm";
import type {
  StoredZoneOccupancy,
  ZoneOccupancyRepository,
  ZoneOccupantCount,
} from "../domain/zone-occupancy.repository";

// Vehicles of the zone's tenant whose last position the zone covers, honouring
// its vehicle assignments (none means every vehicle).
const COVERED_VEHICLES = `
  select p.vehicle_id
    from fleet_geofence_zones z
    join fleet_vehicle_last_positions p on p.tenant_id = z.tenant_id
   where z.tenant_id = ? and z.id = ? and z.status = 'ACTIVE'
     and ST_Covers(z.geom, p.geom)
     and (not exists (select 1 from fleet_geofence_vehicle_assignments a where a.zone_id = z.id)
          or exists (select 1 from fleet_geofence_vehicle_assignments a
                      where a.zone_id = z.id and a.vehicle_id = p.vehicle_id))`;

@Injectable()
export class MikroZoneOccupancyRepository implements ZoneOccupancyRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async findByVehicle(tenantId: string, vehicleId: string): Promise<StoredZoneOccupancy[]> {
    const em = await this.em();
    const records = await em.find(ZoneOccupancyRecord, { tenantId, vehicleId });
    return records.map(toStored);
  }

  async enter(occupancy: StoredZoneOccupancy): Promise<void> {
    const em = await this.em();
    // Upsert on the natural key rather than the id: two positions racing for
    // the same crossing must record one entry, not two.
    await em.upsert(
      ZoneOccupancyRecord,
      {
        id: occupancy.id,
        tenantId: occupancy.tenantId,
        vehicleId: occupancy.vehicleId,
        zoneId: occupancy.zoneId,
        enteredAt: occupancy.enteredAt,
        dwellNotifiedAt: occupancy.dwellNotifiedAt,
        speedingNotifiedAt: occupancy.speedingNotifiedAt,
      },
      { onConflictFields: ["tenantId", "vehicleId", "zoneId"], onConflictAction: "ignore" },
    );
  }

  async exit(tenantId: string, vehicleId: string, zoneIds: string[]): Promise<void> {
    if (zoneIds.length === 0) return;
    const em = await this.em();
    await em.nativeDelete(ZoneOccupancyRecord, { tenantId, vehicleId, zoneId: { $in: zoneIds } });
  }

  async markDwellNotified(
    tenantId: string,
    vehicleId: string,
    zoneId: string,
    at: Date,
  ): Promise<void> {
    const em = await this.em();
    await em.nativeUpdate(
      ZoneOccupancyRecord,
      { tenantId, vehicleId, zoneId },
      { dwellNotifiedAt: at },
    );
  }

  async claimSpeedingAlert(
    tenantId: string,
    vehicleId: string,
    zoneId: string,
    at: Date,
  ): Promise<boolean> {
    const em = await this.em();
    const updated = await em.nativeUpdate(
      ZoneOccupancyRecord,
      { tenantId, vehicleId, zoneId, speedingNotifiedAt: null },
      { speedingNotifiedAt: at },
    );
    return updated > 0;
  }

  async syncZone(tenantId: string, zoneId: string): Promise<void> {
    const em = await this.em();
    await em.transactional(async (tx) => {
      // A vehicle with no known position yet keeps its membership; it is
      // judged on its next fix, not dropped because the table is still filling.
      await tx.execute(
        `delete from fleet_zone_occupancy o
          where o.tenant_id = ? and o.zone_id = ?
            and (
              not exists (select 1 from fleet_geofence_zones z
                           where z.tenant_id = o.tenant_id and z.id = o.zone_id and z.status = 'ACTIVE')
              or (exists (select 1 from fleet_vehicle_last_positions p
                           where p.tenant_id = o.tenant_id and p.vehicle_id = o.vehicle_id and p.geom is not null)
                  and o.vehicle_id not in (${COVERED_VEHICLES}))
            )`,
        [tenantId, zoneId, tenantId, zoneId],
      );
      await tx.execute(
        `insert into fleet_zone_occupancy (id, tenant_id, vehicle_id, zone_id, entered_at)
         select gen_random_uuid()::text, ?, covered.vehicle_id, ?, now()
           from (${COVERED_VEHICLES}) as covered
         on conflict (tenant_id, vehicle_id, zone_id) do nothing`,
        [tenantId, zoneId, tenantId, zoneId],
      );
    });
  }

  async countByZone(tenantId: string): Promise<ZoneOccupantCount[]> {
    const em = await this.em();
    const rows = await em
      .getConnection()
      .execute<Array<{ zone_id: string; vehicles: number | string }>>(
        `select zone_id, count(*)::int as vehicles
           from fleet_zone_occupancy
          where tenant_id = ?
          group by zone_id`,
        [tenantId],
      );
    return rows.map((row) => ({ zoneId: row.zone_id, vehicles: Number(row.vehicles ?? 0) }));
  }

  async listOccupants(tenantId: string, zoneId: string): Promise<StoredZoneOccupancy[]> {
    const em = await this.em();
    const records = await em.find(
      ZoneOccupancyRecord,
      { tenantId, zoneId },
      { orderBy: { enteredAt: "asc" } },
    );
    return records.map(toStored);
  }

  async findPendingDwell(olderThan: Date, limit: number): Promise<StoredZoneOccupancy[]> {
    const em = await this.em();
    const records = await em.find(
      ZoneOccupancyRecord,
      { dwellNotifiedAt: null, enteredAt: { $lte: olderThan } },
      { orderBy: { enteredAt: "asc" }, limit },
    );
    return records.map(toStored);
  }

  private async em() {
    const orm = await getFleetOrm(this.config.db);
    return orm.em.fork();
  }
}

function toStored(record: ZoneOccupancyRecord): StoredZoneOccupancy {
  return {
    id: record.id,
    tenantId: record.tenantId,
    vehicleId: record.vehicleId,
    zoneId: record.zoneId,
    enteredAt: record.enteredAt,
    dwellNotifiedAt: record.dwellNotifiedAt ?? null,
    speedingNotifiedAt: record.speedingNotifiedAt ?? null,
  };
}
