import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MikroORM } from "@mikro-orm/postgresql";
import { Device } from "../../apps/fleet/src/contexts/fleet/devices/domain/entities/device.entity";
import { MikroDeviceRepository } from "../../apps/fleet/src/contexts/fleet/devices/infrastructure/repositories/mikro-device.repository";
import { getFleetOrm } from "../../apps/fleet/src/contexts/fleet/shared/infrastructure/persistence/fleet-orm";
import { MikroTenantHoldRepository } from "../../apps/fleet/src/contexts/fleet/tenant-hold/infrastructure/mikro-tenant-hold.repository";
import type { HeldDevice } from "../../apps/fleet/src/contexts/fleet/tenant-hold/domain/tenant-hold.repository";
import { MikroShareLinkRepository } from "../../apps/fleet/src/contexts/fleet/tracking/infrastructure/mikro-share-link.repository";
import { dbEnabled, getConfig, getOrm, uniqueId } from "./helper";

type Row = Record<string, unknown>;

const FLEET_DB = "truckmoov_fleet_hold_test";

describe.skipIf(!dbEnabled)("fleet tenant hold on real postgres", () => {
  let fleet: MikroORM;
  let holds: MikroTenantHoldRepository;
  let config: never;
  const query = (sql: string, params: unknown[] = []) => fleet.em.getConnection().execute(sql, params) as Promise<Row[]>;
  const noop = async () => {};

  beforeAll(async () => {
    const admin = await getOrm();
    const exists = await admin.em.getConnection().execute(`select 1 from pg_database where datname = ?`, [FLEET_DB]);
    if (exists.length === 0) await admin.em.getConnection().execute(`create database ${FLEET_DB}`);
    const db = { ...getConfig(), dbName: FLEET_DB };
    config = { db } as never;
    fleet = (await getFleetOrm(db)) as unknown as MikroORM;
    holds = new MikroTenantHoldRepository(config);
  });

  afterAll(async () => {
    await fleet?.close();
  });

  const imei = () => String(Math.floor(Math.random() * 1e15)).padStart(15, "1");

  const addDevice = async (tenantId: string, extra: { vehicleId?: string | null; lifecycle?: string } = {}) => {
    const id = randomUUID();
    await query(
      `insert into fleet_devices (id, imei, manufacturer, model, firmware_version, tenant_id, status, lifecycle_status, vehicle_id)
       values (?, ?, 'Teltonika', 'FMC130', '1', ?, 'active', ?, ?)`,
      [id, imei(), tenantId, extra.lifecycle ?? "assigned", extra.vehicleId ?? null],
    );
    return id;
  };
  const addVehicle = async (tenantId: string) => {
    const id = randomUUID();
    await query(`insert into fleet_vehicles (id, plate_number, model, tenant_id, status) values (?, ?, 'Actros', ?, 'active')`, [id, id.slice(0, 8), tenantId]);
    return id;
  };
  const addLink = async (tenantId: string, vehicleId: string, extra: { revoked?: boolean; expired?: boolean } = {}) => {
    const id = randomUUID();
    await query(
      `insert into fleet_tracking_share_links (id, tenant_id, vehicle_id, token_hash, created_by, expires_at, revoked_at)
       values (?, ?, ?, ?, 'u1', now() + (?::int * interval '1 hour'), ?)`,
      [id, tenantId, vehicleId, randomUUID(), extra.expired ? -1 : 24, extra.revoked ? new Date() : null],
    );
    return { id, token: id };
  };
  const hold = async (table: string, id: string) => (await query(`select hold_cause, held_at, hold_reason from ${table} where id = ?`, [id]))[0];

  it("migration adds the hold columns and partial indexes to all three tables", async () => {
    const cols = await query(
      `select table_name from information_schema.columns where column_name = 'hold_cause'
       and table_name in ('fleet_devices','fleet_vehicles','fleet_tracking_share_links')`,
    );
    const indexes = await query(
      `select indexname from pg_indexes where indexname in ('fleet_devices_hold_index','fleet_vehicles_hold_index','fleet_tracking_share_links_hold_index','fleet_tracking_share_links_tenant_index')`,
    );
    expect(cols).toHaveLength(3);
    expect(indexes).toHaveLength(4);
  });

  it("holds devices, vehicles and live share links and keeps the vehicle binding and statuses", async () => {
    const t = uniqueId("hold");
    const vehicle = await addVehicle(t);
    const device = await addDevice(t, { vehicleId: vehicle });
    const live = await addLink(t, vehicle);
    const revoked = await addLink(t, vehicle, { revoked: true });
    const expired = await addLink(t, vehicle, { expired: true });
    const other = uniqueId("hold");
    const otherDevice = await addDevice(other);
    const chunks: HeldDevice[][] = [];

    const counts = await holds.hold(t, "non_payment", "Unpaid since 2026-10-01, grace of 3 days ended", async (devices) => { chunks.push(devices); });

    expect(counts).toEqual({ devices: 1, vehicles: 1, shareLinks: 1 });
    expect(chunks.flat()).toEqual([expect.objectContaining({ id: device, vehicleId: vehicle, cause: "non_payment" })]);
    expect(await hold("fleet_devices", device)).toMatchObject({ hold_cause: "non_payment", hold_reason: "Unpaid since 2026-10-01, grace of 3 days ended" });
    expect((await hold("fleet_devices", device)).held_at).toBeTruthy();
    expect(await hold("fleet_tracking_share_links", live.id)).toMatchObject({ hold_cause: "non_payment" });
    expect((await hold("fleet_tracking_share_links", revoked.id)).hold_cause).toBeNull();
    expect((await hold("fleet_tracking_share_links", expired.id)).hold_cause).toBeNull();
    expect((await hold("fleet_devices", otherDevice)).hold_cause).toBeNull();
    const kept = (await query(`select vehicle_id, lifecycle_status from fleet_devices where id = ?`, [device]))[0];
    expect(kept).toEqual({ vehicle_id: vehicle, lifecycle_status: "assigned" });
    expect((await query(`select status from fleet_vehicles where id = ?`, [vehicle]))[0].status).toBe("active");
    expect((await query(`select revoked_at from fleet_tracking_share_links where id = ?`, [revoked.id]))[0].revoked_at).not.toBeNull();
  });

  it("is idempotent and chunked: a repeat holds nothing, a small chunk size still holds everything", async () => {
    const t = uniqueId("hold");
    for (let i = 0; i < 5; i += 1) await addDevice(t);
    const small = new MikroTenantHoldRepository(config);
    small.chunkSize = 2;
    const sizes: number[] = [];

    const first = await small.hold(t, "non_payment", "r", async (devices) => { sizes.push(devices.length); });
    const second = await small.hold(t, "non_payment", "r", noop);

    expect(first.devices).toBe(5);
    expect(sizes).toEqual([2, 2, 1]);
    expect(second).toEqual({ devices: 0, vehicles: 0, shareLinks: 0 });
  });

  it("releases only the named causes and leaves the other hold and lifecycle suspension alone", async () => {
    const t = uniqueId("hold");
    const paid = await addDevice(t);
    const staff = await addDevice(t);
    const lifecycle = await addDevice(t, { lifecycle: "suspended" });
    await query(`update fleet_devices set hold_cause = 'tenant_manual', held_at = now() where id = ?`, [staff]);
    const freed: HeldDevice[] = [];

    await holds.hold(t, "non_payment", "r", noop);
    const counts = await holds.release(t, ["non_payment"], async (devices) => { freed.push(...devices); });

    expect(counts.devices).toBe(2);
    expect(freed.map((device) => device.id).sort()).toEqual([paid, lifecycle].sort());
    expect(freed.every((device) => device.cause === null)).toBe(true);
    expect((await hold("fleet_devices", paid)).hold_cause).toBeNull();
    expect((await hold("fleet_devices", staff)).hold_cause).toBe("tenant_manual");
    expect((await query(`select lifecycle_status from fleet_devices where id = ?`, [lifecycle]))[0].lifecycle_status).toBe("suspended");

    await holds.release(t, ["non_payment", "tenant_manual"], noop);
    expect((await hold("fleet_devices", staff)).hold_cause).toBeNull();
  });

  it("retags payment holds to staff holds and announces them", async () => {
    const t = uniqueId("hold");
    const device = await addDevice(t);
    await holds.hold(t, "non_payment", "r", noop);
    const seen: HeldDevice[] = [];

    await holds.retag(t, "non_payment", "tenant_manual", async (devices) => { seen.push(...devices); });

    expect(seen).toEqual([expect.objectContaining({ id: device, cause: "tenant_manual" })]);
    expect((await hold("fleet_devices", device)).hold_cause).toBe("tenant_manual");
    expect((await holds.release(t, ["non_payment"], noop)).devices).toBe(0);
  });

  it("previews what would be held and lists held devices with a cursor", async () => {
    const t = uniqueId("hold");
    const vehicle = await addVehicle(t);
    await addDevice(t);
    await addDevice(t);
    await addLink(t, vehicle);

    expect(await holds.preview([t])).toEqual([{ tenantId: t, devices: 2, vehicles: 1, shareLinks: 1 }]);
    await holds.hold(t, "tenant_manual", "r", noop);
    expect(await holds.preview([t])).toEqual([{ tenantId: t, devices: 0, vehicles: 0, shareLinks: 0 }]);

    const all: string[] = [];
    let cursor: string | null = null;
    for (;;) {
      const page: HeldDevice[] = await holds.listHeldDevices(1, cursor);
      if (page.length === 0) break;
      all.push(...page.filter((device) => device.tenantId === t).map((device) => device.cause ?? ""));
      cursor = page[page.length - 1].id;
    }
    expect(all).toEqual(["tenant_manual", "tenant_manual"]);
  });

  it("saving a device through the repository never clears its hold", async () => {
    const t = uniqueId("hold");
    const id = await addDevice(t, { vehicleId: await addVehicle(t) });
    await holds.hold(t, "non_payment", "r", noop);
    const devices = new MikroDeviceRepository(config);

    const loaded = await devices.findById(id, t);
    expect(loaded?.holdCause).toBe("non_payment");
    await devices.save(Device.create({ ...loaded!.toPrimitives(), name: "Truck 1" }));

    expect((await hold("fleet_devices", id)).hold_cause).toBe("non_payment");
    expect((await devices.findById(id, t))?.name).toBe("Truck 1");
  });

  it("a held share link reads as held, is not counted as viewed, and is live again once released", async () => {
    const t = uniqueId("hold");
    const vehicle = await addVehicle(t);
    const link = await addLink(t, vehicle);
    const links = new MikroShareLinkRepository(config);
    await holds.hold(t, "non_payment", "r", noop);

    const rows = await query(`select token_hash from fleet_tracking_share_links where id = ?`, [link.id]);
    const held = await links.findByTokenHash(String(rows[0].token_hash));
    expect(held?.heldAt).toBeInstanceOf(Date);
    await links.recordView(link.id, new Date());
    expect((await query(`select view_count from fleet_tracking_share_links where id = ?`, [link.id]))[0].view_count).toBe(0);

    await holds.release(t, ["non_payment"], noop);
    const freed = await links.findByTokenHash(String(rows[0].token_hash));
    expect(freed?.heldAt).toBeNull();
    await links.recordView(link.id, new Date());
    expect((await query(`select view_count from fleet_tracking_share_links where id = ?`, [link.id]))[0].view_count).toBe(1);
  });
});
