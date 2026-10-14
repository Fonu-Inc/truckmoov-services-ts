import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { getFleetOrm } from "../../shared/infrastructure/persistence/fleet-orm";
import { nextBreachState } from "../domain/road-speed-breach";
import type { RoadBreach, RoadSpeedRepository } from "../domain/road-speed.repository";
import type { GeoPoint } from "../domain/vehicle-position.repository";

@Injectable()
export class MikroRoadSpeedRepository implements RoadSpeedRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async isBuiltUp(point: GeoPoint): Promise<boolean> {
    const [row] = await this.query<{ built_up: boolean }>(
      `select exists (
         select 1 from fleet_built_up_areas
          where ST_Covers(geom, ST_SetSRID(ST_MakePoint(?::float8, ?::float8), 4326)::geography)
       ) as built_up`,
      [point.lng, point.lat],
    );
    return row?.built_up ?? false;
  }

  async recordBreach(breach: RoadBreach): Promise<boolean> {
    const orm = await getFleetOrm(this.config.db);
    return orm.em.fork().transactional(async (tx) => {
      const inserted = await tx.execute(
        `insert into fleet_road_speeding_state (tenant_id, vehicle_id, last_breach_at, alerted_at)
         values (?, ?, ?, null) on conflict (tenant_id, vehicle_id) do nothing
         returning vehicle_id`,
        [breach.tenantId, breach.vehicleId, breach.at],
      );
      if (inserted.length > 0) return false;

      // The row lock orders replicas: the second sees the first one's alert.
      const [row] = await tx.execute<Array<{ last_breach_at: Date | string; alerted_at: Date | string | null }>>(
        `select last_breach_at, alerted_at from fleet_road_speeding_state
          where tenant_id = ? and vehicle_id = ? for update`,
        [breach.tenantId, breach.vehicleId],
      );
      const prev = { lastBreachAt: new Date(row.last_breach_at), alertedAt: row.alerted_at ? new Date(row.alerted_at) : null };
      const { state, alert } = nextBreachState(prev, breach);
      if (state === prev) return false;
      await tx.execute(
        `update fleet_road_speeding_state set last_breach_at = ?, alerted_at = ?
          where tenant_id = ? and vehicle_id = ?`,
        [state.lastBreachAt, state.alertedAt, breach.tenantId, breach.vehicleId],
      );
      return alert;
    });
  }

  private async query<Row extends object>(sql: string, params: unknown[]): Promise<Row[]> {
    const orm = await getFleetOrm(this.config.db);
    return orm.em.fork().getConnection().execute<Row[]>(sql, params);
  }
}
