import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { getFleetOrm } from "./contexts/fleet/shared/infrastructure/persistence/fleet-orm";

/** A named group of a tenant's vehicles, for management and reporting. */
export type FleetGroup = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  /** Whether violations are tracked and reported for this fleet's vehicles. */
  violationsEnabled: boolean;
  vehicleIds: string[];
  createdAt: Date;
  updatedAt: Date;
};

export interface FleetGroupRepository {
  listByTenant(tenantId: string): Promise<FleetGroup[]>;
  findById(tenantId: string, id: string): Promise<FleetGroup | null>;
  findByName(tenantId: string, name: string): Promise<FleetGroup | null>;
  /** Upserts the group and replaces its vehicles. */
  save(group: FleetGroup): Promise<void>;
  delete(tenantId: string, id: string): Promise<void>;
}

export const FLEET_GROUP_REPOSITORY = Symbol("FLEET_GROUP_REPOSITORY");

type Row = Record<string, unknown>;

@Injectable()
export class MikroFleetGroupRepository implements FleetGroupRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async listByTenant(tenantId: string): Promise<FleetGroup[]> {
    const rows = await (await this.connection()).execute<Row[]>(
      `select * from fleet_groups where tenant_id = ? order by created_at desc, id`,
      [tenantId],
    );
    return this.withVehicles(tenantId, rows);
  }

  async findById(tenantId: string, id: string): Promise<FleetGroup | null> {
    const rows = await (await this.connection()).execute<Row[]>(
      `select * from fleet_groups where tenant_id = ? and id = ?`,
      [tenantId, id],
    );
    return (await this.withVehicles(tenantId, rows))[0] ?? null;
  }

  async findByName(tenantId: string, name: string): Promise<FleetGroup | null> {
    const rows = await (await this.connection()).execute<Row[]>(
      `select * from fleet_groups where tenant_id = ? and lower(name) = lower(?) limit 1`,
      [tenantId, name.trim()],
    );
    return (await this.withVehicles(tenantId, rows))[0] ?? null;
  }

  async save(group: FleetGroup): Promise<void> {
    const orm = await getFleetOrm(this.config.db);
    await orm.em.fork().transactional(async (em) => {
      const connection = em.getConnection();
      const ctx = em.getTransactionContext();
      await connection.execute(
        `insert into fleet_groups (id, tenant_id, name, description, violations_enabled, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?)
         on conflict (id) do update set name = excluded.name, description = excluded.description,
           violations_enabled = excluded.violations_enabled, updated_at = excluded.updated_at`,
        [group.id, group.tenantId, group.name, group.description, group.violationsEnabled, group.createdAt, group.updatedAt],
        "run",
        ctx,
      );
      await connection.execute(`delete from fleet_group_vehicles where fleet_id = ?`, [group.id], "run", ctx);
      for (const vehicleId of group.vehicleIds) {
        await connection.execute(
          `insert into fleet_group_vehicles (fleet_id, vehicle_id, tenant_id) values (?, ?, ?)`,
          [group.id, vehicleId, group.tenantId],
          "run",
          ctx,
        );
      }
    });
  }

  async delete(tenantId: string, id: string): Promise<void> {
    await (await this.connection()).execute(`delete from fleet_groups where tenant_id = ? and id = ?`, [tenantId, id]);
  }

  private async withVehicles(tenantId: string, rows: Row[]): Promise<FleetGroup[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => String(row.id));
    const members = await (await this.connection()).execute<Row[]>(
      `select fleet_id, vehicle_id from fleet_group_vehicles where tenant_id = ? and fleet_id in (${ids.map(() => "?").join(", ")})`,
      [tenantId, ...ids],
    );
    const byFleet = new Map<string, string[]>();
    for (const member of members) {
      const list = byFleet.get(String(member.fleet_id)) ?? [];
      list.push(String(member.vehicle_id));
      byFleet.set(String(member.fleet_id), list);
    }
    return rows.map((row) => ({
      id: String(row.id),
      tenantId: String(row.tenant_id),
      name: String(row.name),
      description: row.description == null ? null : String(row.description),
      violationsEnabled: Boolean(row.violations_enabled),
      vehicleIds: byFleet.get(String(row.id)) ?? [],
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    }));
  }

  private async connection() {
    return (await getFleetOrm(this.config.db)).em.fork().getConnection();
  }
}
