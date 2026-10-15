import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MikroORM } from "@mikro-orm/postgresql";
import { getFleetOrm } from "../../apps/fleet/src/contexts/fleet/shared/infrastructure/persistence/fleet-orm";
import type { StoredGeofenceZone } from "../../apps/fleet/src/geofence-zone.repository";
import { MikroGeofenceZoneRepository } from "../../apps/fleet/src/mikro-geofence-zone.repository";
import { MikroVehiclePositionRepository } from "../../apps/fleet/src/contexts/fleet/tracking/infrastructure/mikro-vehicle-position.repository";
import { MikroZoneOccupancyRepository } from "../../apps/fleet/src/contexts/fleet/tracking/infrastructure/mikro-zone-occupancy.repository";
import { dbEnabled, getConfig, getOrm } from "./helper";

const FLEET_DB = "truckmoov_fleet_zones_test";
const APAPA = { lat: 6.4433, lng: 3.3641 };
// About 200 m east of the Apapa centre, so inside a 500 m circle and outside a 100 m one.
const NEAR_APAPA = { lat: 6.4433, lng: 3.3659 };
// [lng, lat] pairs, as the API stores them: a box around Lagos Island.
const ISLAND: Array<[number, number]> = [
  [3.38, 6.44],
  [3.42, 6.44],
  [3.42, 6.47],
  [3.38, 6.47],
];
const ON_ISLAND = { lat: 6.455, lng: 3.4 };

describe.skipIf(!dbEnabled)("geofence zone containment on real PostGIS", () => {
  let fleet: MikroORM;
  let repo: MikroGeofenceZoneRepository;
  let positions: MikroVehiclePositionRepository;
  let occupancy: MikroZoneOccupancyRepository;

  beforeAll(async () => {
    const admin = await getOrm();
    const exists = await admin.em.getConnection().execute(`select 1 from pg_database where datname = ?`, [FLEET_DB]);
    if (exists.length === 0) await admin.em.getConnection().execute(`create database ${FLEET_DB}`);
    const db = { ...getConfig(), dbName: FLEET_DB };
    fleet = (await getFleetOrm(db)) as unknown as MikroORM;
    repo = new MikroGeofenceZoneRepository({ db } as never);
    positions = new MikroVehiclePositionRepository({ db } as never);
    occupancy = new MikroZoneOccupancyRepository({ db } as never);
  });

  afterAll(async () => {
    await fleet?.close();
  });

  const tenant = () => `t-${randomUUID()}`;

  async function saveZone(tenantId: string, shape: Partial<StoredGeofenceZone>): Promise<string> {
    const id = randomUUID();
    await repo.save({
      id,
      tenantId,
      name: "zone",
      description: null,
      zoneType: "depot",
      coordinates: [],
      centerLatitude: null,
      centerLongitude: null,
      radiusMeters: null,
      status: "ACTIVE",
      category: "Depot",
      entryAlertsEnabled: true,
      exitAlertsEnabled: true,
      dwellAlertsEnabled: false,
      dwellMinutes: null,
      speedLimitEnabled: false,
      speedLimitKph: null,
      scheduleEnabled: false,
      scheduleTimezone: null,
      scheduleDays: [],
      scheduleStartTime: null,
      scheduleEndTime: null,
      assignedVehicleIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      ...shape,
    });
    return id;
  }

  const circle = (radiusMeters: number) => ({
    centerLatitude: APAPA.lat,
    centerLongitude: APAPA.lng,
    radiusMeters,
  });

  const insideIds = async (tenantId: string, point: { lat: number; lng: number }, held: string[] = []) =>
    (await repo.findForPosition(tenantId, point, held)).filter((p) => p.inside).map((p) => p.zone.id);

  it("puts a point inside a circle and outside a smaller one", async () => {
    const t = tenant();
    const wide = await saveZone(t, circle(500));
    const tight = await saveZone(t, circle(100));
    expect(await insideIds(t, NEAR_APAPA)).toEqual([wide]);
    expect(await insideIds(t, APAPA)).toEqual(expect.arrayContaining([wide, tight]));
  });

  it("tests a polygon stored as [lng, lat] pairs in the right axis order", async () => {
    const t = tenant();
    const island = await saveZone(t, { coordinates: ISLAND });
    expect(await insideIds(t, ON_ISLAND)).toEqual([island]);
    // The same numbers read as [lat, lng] would put the box near 3.4N 6.45E, in the sea off Cameroon.
    expect(await insideIds(t, { lat: 3.4, lng: 6.455 })).toEqual([]);
    expect(await insideIds(t, APAPA)).toEqual([]);
  });

  it("treats a zero radius with a center as the polygon, not a circle", async () => {
    const t = tenant();
    const island = await saveZone(t, { ...circle(0), coordinates: ISLAND });
    expect(await insideIds(t, ON_ISLAND)).toEqual([island]);
  });

  // Geography edges are great-circle arcs, not lines of constant latitude, so a
  // vertex is the one boundary point that is exact.
  it("counts a point on the boundary as inside", async () => {
    const t = tenant();
    const island = await saveZone(t, { coordinates: ISLAND });
    expect(await insideIds(t, { lat: 6.44, lng: 3.38 })).toEqual([island]);
  });

  // Drawn corner to corner, a box becomes a bow tie: a left and a right
  // triangle meeting at the centre, with gaps above and below.
  it("repairs a self-intersecting polygon into its valid parts", async () => {
    const t = tenant();
    const bowTie = await saveZone(t, { coordinates: [[3.38, 6.44], [3.42, 6.47], [3.42, 6.44], [3.38, 6.47]] });
    expect(await insideIds(t, { lat: 6.455, lng: 3.415 })).toEqual([bowTie]);
    expect(await insideIds(t, { lat: 6.455, lng: 3.385 })).toEqual([bowTie]);
    expect(await insideIds(t, { lat: 6.442, lng: 3.40 })).toEqual([]);
  });

  it("never matches a polygon with too few points, but keeps a vehicle already held in it", async () => {
    const t = tenant();
    const sliver = await saveZone(t, { coordinates: [[3.38, 6.44], [3.42, 6.47]] });
    expect(await insideIds(t, ON_ISLAND)).toEqual([]);
    expect(await insideIds(t, ON_ISLAND, [sliver])).toEqual([sliver]);
  });

  it("returns a held zone the vehicle has left, marked outside", async () => {
    const t = tenant();
    const island = await saveZone(t, { coordinates: ISLAND });
    const result = await repo.findForPosition(t, APAPA, [island]);
    expect(result.map((p) => ({ id: p.zone.id, inside: p.inside }))).toEqual([{ id: island, inside: false }]);
  });

  it("follows an edited shape on the next position", async () => {
    const t = tenant();
    const id = await saveZone(t, circle(100));
    expect(await insideIds(t, NEAR_APAPA)).toEqual([]);
    const zone = (await repo.findById(id, t))!;
    await repo.save({ ...zone, radiusMeters: 500 });
    expect(await insideIds(t, NEAR_APAPA)).toEqual([id]);
  });

  it("skips archived zones and other tenants' zones", async () => {
    const t = tenant();
    await saveZone(t, { ...circle(500), status: "ARCHIVED" });
    await saveZone(tenant(), circle(500));
    expect(await insideIds(t, APAPA)).toEqual([]);
  });

  it("carries vehicle assignments with each zone", async () => {
    const t = tenant();
    const id = await saveZone(t, circle(500));
    await repo.setVehicleAssignments(id, t, ["v1", "v2"]);
    const [positioned] = await repo.findForPosition(t, APAPA, []);
    expect(positioned.zone.assignedVehicleIds.sort()).toEqual(["v1", "v2"]);
  });

  describe("occupancy sync on zone save", () => {
    // Vehicle ids are global, so each run needs fresh ones.
    const ids = Object.fromEntries(["inside", "outside", "centre", "edge", "assigned", "unassigned", "parked"].map((name) => [name, `${name}-${randomUUID()}`]));
    const park = (tenantId: string, vehicleId: string, point: { lat: number; lng: number }) =>
      positions.record({ tenantId, vehicleId, deviceId: null, point, recordedAt: new Date() });
    const occupants = async (tenantId: string, zoneId: string) =>
      (await occupancy.listOccupants(tenantId, zoneId)).map((o) => o.vehicleId).sort();

    it("adds trucks already parked inside a newly drawn zone", async () => {
      const t = tenant();
      await park(t, ids.inside, NEAR_APAPA);
      await park(t, ids.outside, ON_ISLAND);
      const id = await saveZone(t, circle(500));

      await occupancy.syncZone(t, id);
      expect(await occupants(t, id)).toEqual([ids.inside]);
    });

    it("drops trucks a shrunk zone no longer covers and keeps the rest", async () => {
      const t = tenant();
      await park(t, ids.centre, APAPA);
      await park(t, ids.edge, NEAR_APAPA);
      const id = await saveZone(t, circle(500));
      await occupancy.syncZone(t, id);
      const enteredAt = (await occupancy.listOccupants(t, id)).find((o) => o.vehicleId === ids.centre)!.enteredAt;

      await repo.save({ ...(await repo.findById(id, t))!, radiusMeters: 100 });
      await occupancy.syncZone(t, id);

      const stays = await occupancy.listOccupants(t, id);
      expect(stays.map((o) => o.vehicleId)).toEqual([ids.centre]);
      expect(stays[0].enteredAt).toEqual(enteredAt);
    });

    it("honours vehicle assignments", async () => {
      const t = tenant();
      await park(t, ids.assigned, APAPA);
      await park(t, ids.unassigned, APAPA);
      const id = await saveZone(t, circle(500));
      await repo.setVehicleAssignments(id, t, [ids.assigned]);

      await occupancy.syncZone(t, id);
      expect(await occupants(t, id)).toEqual([ids.assigned]);
    });

    it("clears the occupants of an archived zone", async () => {
      const t = tenant();
      await park(t, ids.parked, APAPA);
      const id = await saveZone(t, circle(500));
      await occupancy.syncZone(t, id);

      await repo.save({ ...(await repo.findById(id, t))!, status: "ARCHIVED" });
      await occupancy.syncZone(t, id);
      expect(await occupants(t, id)).toEqual([]);
    });
  });
});
