import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { getFleetOrm } from "../../shared/infrastructure/persistence/fleet-orm";
import {
  HOLD_CHUNK_SIZE,
  type DeviceChunkHandler,
  type FleetHoldCause,
  type HeldDevice,
  type HoldCounts,
  type TenantHoldRepository,
} from "../domain/tenant-hold.repository";

type Row = Record<string, unknown>;

const DEVICE_RETURNING = "id, tenant_id, imei, manufacturer, model, vehicle_id, hold_cause";
const LIVE_LINK = "revoked_at is null and expires_at > now()";

const causeList = (causes: FleetHoldCause[]) => `{${causes.join(",")}}`;

function toHeldDevice(row: Row): HeldDevice {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    imei: String(row.imei),
    manufacturer: String(row.manufacturer),
    model: String(row.model),
    vehicleId: row.vehicle_id === null || row.vehicle_id === undefined ? null : String(row.vehicle_id),
    cause: (row.hold_cause as FleetHoldCause | null) ?? null,
  };
}

@Injectable()
export class MikroTenantHoldRepository implements TenantHoldRepository {
  chunkSize = HOLD_CHUNK_SIZE;

  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async hold(tenantId: string, cause: FleetHoldCause, reason: string, onDevices: DeviceChunkHandler): Promise<HoldCounts> {
    const set = `hold_cause = ?, held_at = now(), hold_reason = ?`;
    const devices = await this.chunked(
      `update fleet_devices set ${set} where id in (
         select id from fleet_devices where tenant_id = ? and hold_cause is null limit ? for update skip locked)
       returning ${DEVICE_RETURNING}`,
      [cause, reason, tenantId, this.chunkSize],
      async (rows) => onDevices(rows.map(toHeldDevice)),
    );
    const vehicles = await this.chunked(
      `update fleet_vehicles set ${set} where id in (
         select id from fleet_vehicles where tenant_id = ? and hold_cause is null limit ? for update skip locked)
       returning id`,
      [cause, reason, tenantId, this.chunkSize],
    );
    const shareLinks = await this.chunked(
      `update fleet_tracking_share_links set ${set} where id in (
         select id from fleet_tracking_share_links
         where tenant_id = ? and hold_cause is null and ${LIVE_LINK} limit ? for update skip locked)
       returning id`,
      [cause, reason, tenantId, this.chunkSize],
    );
    return { devices, vehicles, shareLinks };
  }

  async release(tenantId: string, causes: FleetHoldCause[], onDevices: DeviceChunkHandler): Promise<HoldCounts> {
    const clear = `hold_cause = null, held_at = null, hold_reason = null`;
    const pick = (table: string) =>
      `update ${table} set ${clear} where id in (
         select id from ${table} where tenant_id = ? and hold_cause = any(?::text[]) limit ? for update skip locked)`;
    const params = [tenantId, causeList(causes), this.chunkSize];
    const devices = await this.chunked(`${pick("fleet_devices")} returning ${DEVICE_RETURNING}`, params, async (rows) =>
      onDevices(rows.map(toHeldDevice)),
    );
    const vehicles = await this.chunked(`${pick("fleet_vehicles")} returning id`, params);
    const shareLinks = await this.chunked(`${pick("fleet_tracking_share_links")} returning id`, params);
    return { devices, vehicles, shareLinks };
  }

  async retag(tenantId: string, from: FleetHoldCause, to: FleetHoldCause, onDevices: DeviceChunkHandler): Promise<void> {
    const move = (table: string) =>
      `update ${table} set hold_cause = ? where id in (
         select id from ${table} where tenant_id = ? and hold_cause = ? limit ? for update skip locked)`;
    const params = [to, tenantId, from, this.chunkSize];
    await this.chunked(`${move("fleet_devices")} returning ${DEVICE_RETURNING}`, params, async (rows) =>
      onDevices(rows.map(toHeldDevice)),
    );
    await this.chunked(`${move("fleet_vehicles")} returning id`, params);
    await this.chunked(`${move("fleet_tracking_share_links")} returning id`, params);
  }

  async preview(tenantIds: string[]): Promise<Array<{ tenantId: string } & HoldCounts>> {
    if (tenantIds.length === 0) return [];
    const list = `{${tenantIds.map((id) => `"${id.replace(/(["\\])/g, "\\$1")}"`).join(",")}}`;
    const [devices, vehicles, links] = await Promise.all([
      this.count("fleet_devices", "", list),
      this.count("fleet_vehicles", "", list),
      this.count("fleet_tracking_share_links", `and ${LIVE_LINK}`, list),
    ]);
    return tenantIds.map((tenantId) => ({
      tenantId,
      devices: devices.get(tenantId) ?? 0,
      vehicles: vehicles.get(tenantId) ?? 0,
      shareLinks: links.get(tenantId) ?? 0,
    }));
  }

  async listHeldDevices(limit: number, afterId: string | null): Promise<HeldDevice[]> {
    const rows = await this.query(
      `select ${DEVICE_RETURNING} from fleet_devices
       where hold_cause is not null and id > ? order by id limit ?`,
      [afterId ?? "", limit],
    );
    return rows.map(toHeldDevice);
  }

  private async count(table: string, extra: string, tenantList: string): Promise<Map<string, number>> {
    const rows = await this.query(
      `select tenant_id, count(*) as n from ${table}
       where tenant_id = any(?::text[]) and hold_cause is null ${extra} group by tenant_id`,
      [tenantList],
    );
    return new Map(rows.map((row) => [String(row.tenant_id), Number(row.n)]));
  }

  private async chunked(sql: string, params: unknown[], onRows?: (rows: Row[]) => Promise<void>): Promise<number> {
    let total = 0;
    for (;;) {
      const rows = await this.query(sql, params);
      if (rows.length === 0) return total;
      total += rows.length;
      if (onRows) await onRows(rows);
      if (rows.length < this.chunkSize) return total;
    }
  }

  private async query(sql: string, params: unknown[]): Promise<Row[]> {
    const orm = await getFleetOrm(this.config.db);
    return (await orm.em.getConnection().execute(sql, params)) as Row[];
  }
}
