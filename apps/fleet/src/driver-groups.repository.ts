import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { getFleetOrm } from "./contexts/fleet/shared/infrastructure/persistence/fleet-orm";

/** A named group of a tenant's drivers, for management and reporting. */
export type DriverGroup = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  /** Whether violations are tracked and reported for this group's drivers. */
  violationsEnabled: boolean;
  driverIds: string[];
  createdAt: Date;
  updatedAt: Date;
};

export interface DriverGroupRepository {
  listByTenant(tenantId: string): Promise<DriverGroup[]>;
  findById(tenantId: string, id: string): Promise<DriverGroup | null>;
  findByName(tenantId: string, name: string): Promise<DriverGroup | null>;
  /** Upserts the group and replaces its drivers. */
  save(group: DriverGroup): Promise<void>;
  delete(tenantId: string, id: string): Promise<void>;
}

export const DRIVER_GROUP_REPOSITORY = Symbol("DRIVER_GROUP_REPOSITORY");

type Row = Record<string, unknown>;

@Injectable()
export class MikroDriverGroupRepository implements DriverGroupRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async listByTenant(tenantId: string): Promise<DriverGroup[]> {
    const rows = await (await this.connection()).execute<Row[]>(
      `select * from driver_groups where tenant_id = ? order by created_at desc, id`,
      [tenantId],
    );
    return this.withDrivers(tenantId, rows);
  }

  async findById(tenantId: string, id: string): Promise<DriverGroup | null> {
    const rows = await (await this.connection()).execute<Row[]>(
      `select * from driver_groups where tenant_id = ? and id = ?`,
      [tenantId, id],
    );
    return (await this.withDrivers(tenantId, rows))[0] ?? null;
  }

  async findByName(tenantId: string, name: string): Promise<DriverGroup | null> {
    const rows = await (await this.connection()).execute<Row[]>(
      `select * from driver_groups where tenant_id = ? and lower(name) = lower(?) limit 1`,
      [tenantId, name.trim()],
    );
    return (await this.withDrivers(tenantId, rows))[0] ?? null;
  }

  async save(group: DriverGroup): Promise<void> {
    const orm = await getFleetOrm(this.config.db);
    await orm.em.fork().transactional(async (em) => {
      const connection = em.getConnection();
      const ctx = em.getTransactionContext();
      await connection.execute(
        `insert into driver_groups (id, tenant_id, name, description, violations_enabled, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?)
         on conflict (id) do update set name = excluded.name, description = excluded.description,
           violations_enabled = excluded.violations_enabled, updated_at = excluded.updated_at`,
        [group.id, group.tenantId, group.name, group.description, group.violationsEnabled, group.createdAt, group.updatedAt],
        "run",
        ctx,
      );
      await connection.execute(`delete from driver_group_drivers where group_id = ?`, [group.id], "run", ctx);
      for (const driverId of group.driverIds) {
        await connection.execute(
          `insert into driver_group_drivers (group_id, driver_id, tenant_id) values (?, ?, ?)`,
          [group.id, driverId, group.tenantId],
          "run",
          ctx,
        );
      }
    });
  }

  async delete(tenantId: string, id: string): Promise<void> {
    await (await this.connection()).execute(`delete from driver_groups where tenant_id = ? and id = ?`, [tenantId, id]);
  }

  private async withDrivers(tenantId: string, rows: Row[]): Promise<DriverGroup[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => String(row.id));
    const members = await (await this.connection()).execute<Row[]>(
      `select group_id, driver_id from driver_group_drivers where tenant_id = ? and group_id in (${ids.map(() => "?").join(", ")})`,
      [tenantId, ...ids],
    );
    const byGroup = new Map<string, string[]>();
    for (const member of members) {
      const list = byGroup.get(String(member.group_id)) ?? [];
      list.push(String(member.driver_id));
      byGroup.set(String(member.group_id), list);
    }
    return rows.map((row) => ({
      id: String(row.id),
      tenantId: String(row.tenant_id),
      name: String(row.name),
      description: row.description == null ? null : String(row.description),
      violationsEnabled: Boolean(row.violations_enabled),
      driverIds: byGroup.get(String(row.id)) ?? [],
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    }));
  }

  private async connection() {
    return (await getFleetOrm(this.config.db)).em.fork().getConnection();
  }
}
