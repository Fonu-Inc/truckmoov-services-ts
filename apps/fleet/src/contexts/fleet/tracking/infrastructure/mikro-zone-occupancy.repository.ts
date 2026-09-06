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
  };
}
