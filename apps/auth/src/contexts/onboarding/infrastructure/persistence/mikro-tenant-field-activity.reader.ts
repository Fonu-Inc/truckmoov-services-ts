import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { INSTALLATION_TIME_ZONE } from '@shared/devices';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';
import type {
  FieldActivityEvent,
  TenantFieldActivityReader,
  TenantUsageCounts,
} from '../../domain/tenant-field-activity.reader';
import { pgTextArray } from '@shared/db';

type DayGroup = { day: string; occurred_at: Date; label: string; count: number; sample: string | null };
type Connection = ReturnType<Awaited<ReturnType<typeof getAuthOrm>>['em']['getConnection']>;
type ExistsRow = { exists?: boolean | number | string };
type SimRow = { day: string; occurred_at: Date; carrier: string; count: number };
type InstallationRow = { id: string; completed_at: Date; order_number: string; vehicle_count: number };

const SIMS_ADDED = `
  select to_char(coalesce(activation_date, created_at) at time zone '${INSTALLATION_TIME_ZONE}', 'YYYY-MM-DD') as day,
         max(coalesce(activation_date, created_at)) as occurred_at, carrier, count(*)::int as count
    from iot_sims
   where tenant_id = ?
   group by 1, 3 order by 2 desc limit ?`;

const INSTALLATIONS_COMPLETED = `
  select o.id, o.completed_at, o.order_number,
         (select count(distinct a.vehicle_id)::int from installation_device_assignments a where a.order_id = o.id) as vehicle_count
    from installation_orders o
   where o.tenant_id = ? and o.status = 'completed' and o.completed_at is not null
   order by o.completed_at desc limit ?`;

const day = (column: string) => `to_char(${column} at time zone '${INSTALLATION_TIME_ZONE}', 'YYYY-MM-DD')`;

const vehicleGroups = (filter: string, dateColumn: string) => `
  select ${day(dateColumn)} as day, max(${dateColumn}) as occurred_at,
         coalesce(nullif(type, ''), 'vehicle') as label, count(*)::int as count, max(plate_number) as sample
    from fleet_vehicles
   where tenant_id = ? and ${filter}
   group by 1, 3 order by 2 desc limit ?`;

const deviceGroups = (filter: string, dateColumn: string) => `
  select ${day(dateColumn)} as day, max(${dateColumn}) as occurred_at,
         trim(manufacturer || ' ' || model) as label, count(*)::int as count, max(imei) as sample
    from fleet_devices
   where tenant_id = ? and ${filter}
   group by 1, 3 order by 2 desc limit ?`;

const VEHICLES_ADDED = vehicleGroups('true', 'created_at');
const VEHICLES_REMOVED = vehicleGroups("status = 'decommissioned'", 'updated_at');
const DEVICES_ADDED = deviceGroups('true', 'created_at');
const DEVICES_REMOVED = deviceGroups("lifecycle_status = 'decommissioned'", 'updated_at');

const USAGE_COUNTS = `
  select
    (select count(*) from fleet_vehicles where tenant_id = ? and status = 'active')::int as vehicles,
    (select count(*) from fleet_drivers where tenant_id = ? and status in ('active', 'available'))::int as drivers,
    (select count(*) from fleet_devices
      where tenant_id = ? and vehicle_id is not null
        and lifecycle_status not in ('decommissioned', 'faulty'))::int as devices,
    (select count(*) from iot_sims
      where tenant_id = ? and (device_id is not null or status = 'active'))::int as sims`;

const FLEET_TABLES = ['fleet_vehicles', 'fleet_drivers', 'fleet_devices'];

const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const vehicleResource = (group: DayGroup) => {
  const type = capitalised(group.label);
  return group.count === 1 && group.sample ? `${type} ${group.sample}` : `${group.count} × ${type}`;
};

const deviceResource = (group: DayGroup) =>
  group.count === 1 && group.sample ? `${group.label} (${group.sample})` : `${group.count} × ${group.label}`;

const toEvents = (
  rows: DayGroup[],
  kind: string,
  event: FieldActivityEvent['event'],
  resource: (group: DayGroup) => string,
): FieldActivityEvent[] =>
  rows.map((row) => ({
    id: `fleet:${kind}:${row.day}:${row.label}`,
    occurredAt: new Date(row.occurred_at),
    event,
    resource: resource(row),
  }));

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

@Injectable()
export class MikroTenantFieldActivityReader implements TenantFieldActivityReader {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async list(tenantId: string, limit: number): Promise<FieldActivityEvent[]> {
    const [field, fleet] = await Promise.all([this.fieldEvents(tenantId, limit), this.fleetEvents(tenantId, limit)]);
    return [...field, ...fleet];
  }

  async usageCounts(tenantId: string): Promise<TenantUsageCounts | null> {
    const connection = await this.connection();
    if (!(await this.fleetTablesExist(connection))) return null;
    const [row] = await connection.execute<Array<Partial<TenantUsageCounts>>>(USAGE_COUNTS, [
      tenantId,
      tenantId,
      tenantId,
      tenantId,
    ]);
    return {
      vehicles: row?.vehicles ?? 0,
      drivers: row?.drivers ?? 0,
      devices: row?.devices ?? 0,
      sims: row?.sims ?? 0,
    };
  }

  private async connection(): Promise<Connection> {
    const orm = await getAuthOrm(this.config.db);
    return orm.em.getConnection();
  }

  private async fleetTablesExist(connection: Connection): Promise<boolean> {
    const rows = await connection.execute<ExistsRow[]>(
      `select count(*)::int as exists from information_schema.tables
        where table_schema = 'public' and table_name = any(?::text[])`,
      [pgTextArray(FLEET_TABLES)],
    );
    return Number(rows[0]?.exists) === FLEET_TABLES.length;
  }

  private async fleetEvents(tenantId: string, limit: number): Promise<FieldActivityEvent[]> {
    const connection = await this.connection();
    if (!(await this.fleetTablesExist(connection))) return [];
    const run = (sql: string) => connection.execute<DayGroup[]>(sql, [tenantId, limit]);
    const [vehicles, vehiclesGone, devices, devicesGone] = await Promise.all([
      run(VEHICLES_ADDED),
      run(VEHICLES_REMOVED),
      run(DEVICES_ADDED),
      run(DEVICES_REMOVED),
    ]);
    return [
      ...toEvents(vehicles, 'vehicles-added', 'Vehicles Added', vehicleResource),
      ...toEvents(devices, 'devices-added', 'Devices Added', deviceResource),
      ...toEvents(vehiclesGone, 'vehicles-removed', 'Service Removed', vehicleResource),
      ...toEvents(devicesGone, 'devices-removed', 'Service Removed', deviceResource),
    ];
  }

  private async fieldEvents(tenantId: string, limit: number): Promise<FieldActivityEvent[]> {
    const connection = await this.connection();
    const [sims, installations] = await Promise.all([
      connection.execute<SimRow[]>(SIMS_ADDED, [tenantId, limit]),
      connection.execute<InstallationRow[]>(INSTALLATIONS_COMPLETED, [tenantId, limit]),
    ]);

    return [
      ...sims.map((row) => ({
        id: `sims:${row.day}:${row.carrier}`,
        occurredAt: new Date(row.occurred_at),
        event: 'SIMs Added' as const,
        resource: `${row.count} × ${row.carrier} IoT SIM`,
      })),
      ...installations.map((row) => ({
        id: `installation:${row.id}`,
        occurredAt: new Date(row.completed_at),
        event: 'Installation Completed' as const,
        resource: `Work order ${row.order_number} (${plural(row.vehicle_count, 'vehicle')})`,
      })),
    ];
  }
}
