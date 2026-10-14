import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { getFleetOrm } from "../../shared/infrastructure/persistence/fleet-orm";
import type { PlannedRouteRepository } from "../domain/planned-route.repository";
import type { GeoPoint } from "../domain/vehicle-position.repository";

@Injectable()
export class MikroPlannedRouteRepository implements PlannedRouteRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async replace(tenantId: string, vehicleId: string, jobId: string, line: GeoPoint[]): Promise<void> {
    const wkt = `SRID=4326;LINESTRING(${line.map((p) => `${p.lng} ${p.lat}`).join(", ")})`;
    await this.query(
      `insert into fleet_vehicle_planned_routes as r (vehicle_id, tenant_id, job_id, geom, off_route_fixes, updated_at)
       values (?, ?, ?, ST_GeogFromText(?), 0, now())
       on conflict (tenant_id, vehicle_id) do update set
         job_id = excluded.job_id, geom = excluded.geom, off_route_fixes = 0, updated_at = now()`,
      [vehicleId, tenantId, jobId, wkt],
    );
  }

  async removeJob(tenantId: string, jobId: string): Promise<void> {
    await this.query(`delete from fleet_vehicle_planned_routes where tenant_id = ? and job_id = ?`, [tenantId, jobId]);
  }

  async checkFix(
    tenantId: string,
    vehicleId: string,
    point: GeoPoint,
    bufferMeters: number,
    confirmFixes: number,
  ): Promise<string | null> {
    // One statement, so the row lock orders concurrent fixes from two replicas.
    const [row] = await this.query<{ job_id: string; off_route_fixes: number }>(
      `update fleet_vehicle_planned_routes r set
         off_route_fixes = case
           when ST_DWithin(r.geom, ST_SetSRID(ST_MakePoint(?::float8, ?::float8), 4326)::geography, ?) then 0
           else r.off_route_fixes + 1
         end,
         updated_at = now()
       where r.tenant_id = ? and r.vehicle_id = ?
       returning r.job_id, r.off_route_fixes`,
      [point.lng, point.lat, bufferMeters, tenantId, vehicleId],
    );
    return row && Number(row.off_route_fixes) === confirmFixes ? row.job_id : null;
  }

  private async query<Row extends object = object>(sql: string, params: unknown[]): Promise<Row[]> {
    const orm = await getFleetOrm(this.config.db);
    return orm.em.fork().getConnection().execute<Row[]>(sql, params);
  }
}
