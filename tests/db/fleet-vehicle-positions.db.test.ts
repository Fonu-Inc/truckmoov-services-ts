import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MikroORM } from "@mikro-orm/postgresql";
import { getFleetOrm } from "../../apps/fleet/src/contexts/fleet/shared/infrastructure/persistence/fleet-orm";
import { MikroVehiclePositionRepository } from "../../apps/fleet/src/contexts/fleet/tracking/infrastructure/mikro-vehicle-position.repository";
import { haversineKm } from "../../apps/fleet/src/utils/haversine";
import { dbEnabled, getConfig, getOrm } from "./helper";

const FLEET_DB = "truckmoov_fleet_positions_test";
const LAGOS = { lat: 6.5244, lng: 3.3792 };
const IKEJA = { lat: 6.6018, lng: 3.3515 };
const IBADAN = { lat: 7.3775, lng: 3.947 };

describe.skipIf(!dbEnabled)("vehicle last positions on real PostGIS", () => {
  let fleet: MikroORM;
  let podA: MikroVehiclePositionRepository;
  let podB: MikroVehiclePositionRepository;

  beforeAll(async () => {
    const admin = await getOrm();
    const exists = await admin.em.getConnection().execute(`select 1 from pg_database where datname = ?`, [FLEET_DB]);
    if (exists.length === 0) await admin.em.getConnection().execute(`create database ${FLEET_DB}`);
    const db = { ...getConfig(), dbName: FLEET_DB };
    fleet = (await getFleetOrm(db)) as unknown as MikroORM;
    podA = new MikroVehiclePositionRepository({ db } as never);
    podB = new MikroVehiclePositionRepository({ db } as never);
  });

  afterAll(async () => {
    await fleet?.close();
  });

  const tenant = () => `t-${randomUUID()}`;
  const record = (repo: MikroVehiclePositionRepository, tenantId: string, vehicleId: string, point: { lat: number; lng: number } | null, at: Date) =>
    repo.record({ tenantId, vehicleId, deviceId: "imei-1", point, recordedAt: at });

  it("shares a fix recorded by one replica with every other replica", async () => {
    const t = tenant();
    const v = randomUUID();
    const at = new Date("2026-10-13T08:00:00Z");
    await record(podA, t, v, LAGOS, at);

    const seen = (await podB.findByVehicleIds(t, [v])).get(v);
    expect(seen).toMatchObject({ vehicleId: v, deviceId: "imei-1", lastSeen: at.getTime() });
    expect(seen?.lat).toBeCloseTo(LAGOS.lat, 6);
    expect(seen?.lng).toBeCloseTo(LAGOS.lng, 6);
    expect(seen?.distanceKm).toBeNull();
  });

  it("returns the geodesic distance to an origin", async () => {
    const t = tenant();
    const v = randomUUID();
    await record(podA, t, v, IKEJA, new Date());

    const { distanceKm } = (await podA.findByVehicleIds(t, [v], LAGOS)).get(v)!;
    const expected = haversineKm(LAGOS.lat, LAGOS.lng, IKEJA.lat, IKEJA.lng);
    expect(Math.abs(distanceKm! - expected) / expected).toBeLessThan(0.01);
  });

  it("keeps the newest fix when a buffered older one arrives late", async () => {
    const t = tenant();
    const v = randomUUID();
    await record(podA, t, v, IKEJA, new Date("2026-10-13T09:00:00Z"));
    await record(podB, t, v, LAGOS, new Date("2026-10-13T08:00:00Z"));

    const seen = (await podA.findByVehicleIds(t, [v])).get(v)!;
    expect(seen.lat).toBeCloseTo(IKEJA.lat, 6);
    expect(seen.lastSeen).toBe(new Date("2026-10-13T09:00:00Z").getTime());
  });

  it("ignores a write for another tenant's vehicle", async () => {
    const owner = tenant();
    const v = randomUUID();
    await record(podA, owner, v, LAGOS, new Date("2026-10-13T08:00:00Z"));
    await record(podA, tenant(), v, IBADAN, new Date("2026-10-13T10:00:00Z"));

    const seen = (await podA.findByVehicleIds(owner, [v])).get(v)!;
    expect(seen.lat).toBeCloseTo(LAGOS.lat, 6);
  });

  it("refreshes last seen without losing the position when a fix has no coordinates", async () => {
    const t = tenant();
    const v = randomUUID();
    await record(podA, t, v, LAGOS, new Date("2026-10-13T08:00:00Z"));
    await record(podA, t, v, null, new Date("2026-10-13T08:05:00Z"));

    const seen = (await podA.findByVehicleIds(t, [v])).get(v)!;
    expect(seen.lat).toBeCloseTo(LAGOS.lat, 6);
    expect(seen.lastSeen).toBe(new Date("2026-10-13T08:05:00Z").getTime());
  });

  it("orders nearest vehicles by distance, within the given vehicles and limit", async () => {
    const t = tenant();
    const [near, mid, far, other, unplaced] = Array.from({ length: 5 }, () => randomUUID());
    await record(podA, t, near, { lat: 6.53, lng: 3.38 }, new Date());
    await record(podA, t, mid, IKEJA, new Date());
    await record(podA, t, far, IBADAN, new Date());
    await record(podA, t, other, LAGOS, new Date());
    await record(podA, t, unplaced, null, new Date());

    const nearest = await podB.nearest(t, LAGOS, [near, mid, far, unplaced], 2);
    expect(nearest.map((p) => p.vehicleId)).toEqual([near, mid]);
    expect(nearest[0].distanceKm!).toBeLessThan(nearest[1].distanceKm!);
  });

  it("returns nothing for an empty vehicle list", async () => {
    expect((await podA.findByVehicleIds(tenant(), [])).size).toBe(0);
    expect(await podA.nearest(tenant(), LAGOS, [], 5)).toEqual([]);
  });
});
