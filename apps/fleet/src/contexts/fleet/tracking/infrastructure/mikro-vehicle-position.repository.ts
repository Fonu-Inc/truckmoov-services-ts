import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { getFleetOrm } from "../../shared/infrastructure/persistence/fleet-orm";
import type {
  GeoPoint,
  PositionFix,
  VehiclePosition,
  VehiclePositionRepository,
} from "../domain/vehicle-position.repository";

type PositionRow = {
  vehicle_id: string;
  device_id: string | null;
  lat: number | null;
  lng: number | null;
  last_seen: string | number;
  distance_km: string | number | null;
};

const POINT = "ST_SetSRID(ST_MakePoint(?::float8, ?::float8), 4326)::geography";

const SELECT_POSITIONS = `
  select vehicle_id, device_id,
         ST_Y(geom::geometry) as lat, ST_X(geom::geometry) as lng,
         extract(epoch from recorded_at) * 1000 as last_seen,
         ST_Distance(geom, ${POINT}) / 1000 as distance_km
    from fleet_vehicle_last_positions
   where tenant_id = ? and vehicle_id in (?)`;

@Injectable()
export class MikroVehiclePositionRepository implements VehiclePositionRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async record(fix: PositionFix): Promise<void> {
    // Keyed by tenant as well as vehicle, so a write naming another tenant's
    // vehicle id lands in the writer's own tenant and touches nothing else.
    await this.query(
      `insert into fleet_vehicle_last_positions as p
         (vehicle_id, tenant_id, device_id, geom, recorded_at, updated_at)
       values (?, ?, ?, ${POINT}, ?, now())
       on conflict (tenant_id, vehicle_id) do update set
         device_id = coalesce(excluded.device_id, p.device_id),
         geom = coalesce(excluded.geom, p.geom),
         recorded_at = excluded.recorded_at,
         updated_at = now()
       where p.recorded_at <= excluded.recorded_at`,
      [
        fix.vehicleId,
        fix.tenantId,
        fix.deviceId,
        fix.point?.lng ?? null,
        fix.point?.lat ?? null,
        fix.recordedAt,
      ],
    );
  }

  async findByVehicleIds(
    tenantId: string,
    vehicleIds: readonly string[],
    origin?: GeoPoint,
  ): Promise<Map<string, VehiclePosition>> {
    if (vehicleIds.length === 0) return new Map();
    const rows = await this.query<PositionRow>(SELECT_POSITIONS, [
      ...originBindings(origin),
      tenantId,
      [...vehicleIds],
    ]);
    return new Map(rows.map((row) => [row.vehicle_id, toPosition(row)]));
  }

  async nearest(
    tenantId: string,
    origin: GeoPoint,
    vehicleIds: readonly string[],
    limit: number,
  ): Promise<VehiclePosition[]> {
    if (vehicleIds.length === 0 || limit <= 0) return [];
    const rows = await this.query<PositionRow>(
      `${SELECT_POSITIONS} and geom is not null order by geom <-> ${POINT} limit ?`,
      [...originBindings(origin), tenantId, [...vehicleIds], ...originBindings(origin), limit],
    );
    return rows.map(toPosition);
  }

  private async query<Row extends object>(sql: string, params: unknown[]): Promise<Row[]> {
    const orm = await getFleetOrm(this.config.db);
    return orm.em.fork().getConnection().execute<Row[]>(sql, params);
  }
}

function originBindings(origin?: GeoPoint): [number | null, number | null] {
  return [origin?.lng ?? null, origin?.lat ?? null];
}

function toPosition(row: PositionRow): VehiclePosition {
  return {
    vehicleId: row.vehicle_id,
    deviceId: row.device_id,
    lat: row.lat,
    lng: row.lng,
    lastSeen: Number(row.last_seen),
    distanceKm: row.distance_km == null ? null : Number(row.distance_km),
  };
}
