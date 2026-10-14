import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MikroORM } from "@mikro-orm/postgresql";
import { getFleetOrm } from "../../apps/fleet/src/contexts/fleet/shared/infrastructure/persistence/fleet-orm";
import { MikroPlannedRouteRepository } from "../../apps/fleet/src/contexts/fleet/tracking/infrastructure/mikro-planned-route.repository";
import { MikroRoadSpeedRepository } from "../../apps/fleet/src/contexts/fleet/tracking/infrastructure/mikro-road-speed.repository";
import { dbEnabled, getConfig, getOrm } from "./helper";

const FLEET_DB = "truckmoov_fleet_road_rules_test";
// A straight east-west road west of Ibadan; 0.001 deg of latitude is about 110 m.
const ROUTE = [
  { lat: 7.3, lng: 3.7 },
  { lat: 7.3, lng: 3.8 },
];
const ON_ROUTE = { lat: 7.3003, lng: 3.75 };
const OFF_ROUTE = { lat: 7.305, lng: 3.75 };

describe.skipIf(!dbEnabled)("road rules on real PostGIS", () => {
  let fleet: MikroORM;
  let roads: MikroRoadSpeedRepository;
  let routes: MikroPlannedRouteRepository;

  beforeAll(async () => {
    const admin = await getOrm();
    const exists = await admin.em.getConnection().execute(`select 1 from pg_database where datname = ?`, [FLEET_DB]);
    if (exists.length === 0) await admin.em.getConnection().execute(`create database ${FLEET_DB}`);
    const db = { ...getConfig(), dbName: FLEET_DB };
    fleet = (await getFleetOrm(db)) as unknown as MikroORM;
    roads = new MikroRoadSpeedRepository({ db } as never);
    routes = new MikroPlannedRouteRepository({ db } as never);
  });

  afterAll(async () => {
    await fleet?.close();
  });

  describe("built-up areas", () => {
    it("reads Lagos, Ibadan and Kano as towns and open highway as open road", async () => {
      expect(await roads.isBuiltUp({ lat: 6.6018, lng: 3.3515 })).toBe(true);
      expect(await roads.isBuiltUp({ lat: 7.3775, lng: 3.947 })).toBe(true);
      expect(await roads.isBuiltUp({ lat: 12.0022, lng: 8.592 })).toBe(true);
      expect(await roads.isBuiltUp({ lat: 9.75, lng: 7.44 })).toBe(false);
    });
  });

  describe("road speeding breaches", () => {
    const breach = (vehicleId: string, at: string, tenantId = "t1") =>
      roads.recordBreach({ tenantId, vehicleId, at: new Date(at), confirmWithinSeconds: 120, cooldownMinutes: 15 });

    it("alerts on a second breach within two minutes, then waits out the cooldown", async () => {
      const v = randomUUID();
      expect(await breach(v, "2026-10-13T09:00:00Z")).toBe(false);
      expect(await breach(v, "2026-10-13T09:00:30Z")).toBe(true);
      expect(await breach(v, "2026-10-13T09:01:00Z")).toBe(false);
      expect(await breach(v, "2026-10-13T09:16:00Z")).toBe(false);
      expect(await breach(v, "2026-10-13T09:16:30Z")).toBe(true);
    });

    it("does not confirm a breach that came too long before", async () => {
      const v = randomUUID();
      await breach(v, "2026-10-13T09:00:00Z");
      expect(await breach(v, "2026-10-13T09:05:00Z")).toBe(false);
      expect(await breach(v, "2026-10-13T09:05:30Z")).toBe(true);
    });

    it("ignores a late, older breach and alerts once for two replicas", async () => {
      const v = randomUUID();
      await breach(v, "2026-10-13T09:00:00Z");
      expect(await breach(v, "2026-10-13T08:59:00Z")).toBe(false);
      const results = await Promise.all([breach(v, "2026-10-13T09:00:30Z"), breach(v, "2026-10-13T09:00:30Z")]);
      expect(results.filter(Boolean)).toHaveLength(1);
    });

    it("keeps each tenant's state apart", async () => {
      const v = randomUUID();
      await breach(v, "2026-10-13T09:00:00Z", "tenant-a");
      expect(await breach(v, "2026-10-13T09:00:30Z", "tenant-b")).toBe(false);
    });
  });

  describe("planned routes", () => {
    const check = (tenantId: string, vehicleId: string, point: { lat: number; lng: number }) =>
      routes.checkFix(tenantId, vehicleId, point, 100, 2);

    it("confirms a deviation on the second fix off route, once per excursion", async () => {
      const t = `t-${randomUUID()}`;
      const v = randomUUID();
      await routes.replace(t, v, "job-1", ROUTE);

      expect(await check(t, v, ON_ROUTE)).toBeNull();
      expect(await check(t, v, OFF_ROUTE)).toBeNull();
      expect(await check(t, v, OFF_ROUTE)).toBe("job-1");
      expect(await check(t, v, OFF_ROUTE)).toBeNull();

      expect(await check(t, v, ON_ROUTE)).toBeNull();
      expect(await check(t, v, OFF_ROUTE)).toBeNull();
      expect(await check(t, v, OFF_ROUTE)).toBe("job-1");
    });

    it("has nothing to check for a vehicle with no route, or after the job ends", async () => {
      const t = `t-${randomUUID()}`;
      const v = randomUUID();
      expect(await check(t, v, OFF_ROUTE)).toBeNull();

      await routes.replace(t, v, "job-2", ROUTE);
      await routes.removeJob(t, "job-2");
      await check(t, v, OFF_ROUTE);
      expect(await check(t, v, OFF_ROUTE)).toBeNull();
    });

    it("resets the count when the vehicle gets a new route", async () => {
      const t = `t-${randomUUID()}`;
      const v = randomUUID();
      await routes.replace(t, v, "job-3", ROUTE);
      await check(t, v, OFF_ROUTE);
      await routes.replace(t, v, "job-4", ROUTE);
      expect(await check(t, v, OFF_ROUTE)).toBeNull();
      expect(await check(t, v, OFF_ROUTE)).toBe("job-4");
    });

    it("ignores another tenant writing a route for the vehicle", async () => {
      const t = `t-${randomUUID()}`;
      const v = randomUUID();
      await routes.replace(t, v, "job-5", ROUTE);
      await routes.replace("intruder", v, "job-x", [OFF_ROUTE, { lat: 7.305, lng: 3.76 }]);
      await check(t, v, OFF_ROUTE);
      expect(await check(t, v, OFF_ROUTE)).toBe("job-5");
    });
  });
});
