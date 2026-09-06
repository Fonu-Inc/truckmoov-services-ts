import { beforeEach, describe, expect, it } from "vitest";
import { GeofenceEvaluatorService } from "../../../apps/fleet/src/contexts/fleet/tracking/application/geofence-evaluator.service";
import { InMemoryZoneOccupancyRepository } from "../../../apps/fleet/src/contexts/fleet/tracking/infrastructure/in-memory-zone-occupancy.repository";
import {
  distanceMeters,
  isInsidePolygon,
  isInsideZone,
} from "../../../apps/fleet/src/contexts/fleet/tracking/domain/zone-geometry";
import { zoneIsArmed } from "../../../apps/fleet/src/contexts/fleet/tracking/domain/zone-transitions";
import type { StoredGeofenceZone } from "../../../apps/fleet/src/geofence-zone.repository";

const APAPA = { lat: 6.4433, lng: 3.3641 };
const LEKKI = { lat: 6.4698, lng: 3.5852 };

function zone(overrides: Partial<StoredGeofenceZone> = {}): StoredGeofenceZone {
  return {
    id: "zone-1",
    tenantId: "tenant-a",
    name: "Apapa Port Depot",
    description: null,
    zoneType: "depot",
    coordinates: [],
    centerLatitude: APAPA.lat,
    centerLongitude: APAPA.lng,
    radiusMeters: 1000,
    status: "ACTIVE",
    category: "Depot",
    entryAlertsEnabled: true,
    exitAlertsEnabled: true,
    dwellAlertsEnabled: false,
    dwellMinutes: null,
    speedLimitEnabled: false,
    speedLimitKph: null,
    scheduleEnabled: false,
    scheduleTimezone: "Africa/Lagos",
    scheduleDays: [],
    scheduleStartTime: null,
    scheduleEndTime: null,
    assignedVehicleIds: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildEvaluator(zones: StoredGeofenceZone[]) {
  const occupancy = new InMemoryZoneOccupancyRepository();
  const zoneRepo = {
    findAllByTenant: async () => zones,
    findById: async (id: string) => zones.find((z) => z.id === id) ?? null,
    save: async () => {},
    deleteById: async () => {},
    setVehicleAssignments: async () => {},
  };
  const config = { overview: { cacheTtlSeconds: 0 } } as never;

  return {
    evaluator: new GeofenceEvaluatorService(zoneRepo as never, occupancy, config),
    occupancy,
  };
}

describe("Zone geometry", () => {
  it("measures the distance between two Lagos points", () => {
    // Apapa to Lekki Phase 1 is roughly 24 km as the crow flies.
    const metres = distanceMeters(APAPA, LEKKI);
    expect(metres).toBeGreaterThan(23_000);
    expect(metres).toBeLessThan(26_000);
  });

  it("puts a point inside and outside a circular zone", () => {
    expect(isInsideZone(zone(), { lat: 6.4440, lng: 3.3650 })).toBe(true);
    expect(isInsideZone(zone(), LEKKI)).toBe(false);
  });

  // A bounding box around a zone on the Lekki peninsula covers a lot of lagoon,
  // which is why a polygon is tested as a polygon.
  it("ray casts a polygon rather than approximating a box", () => {
    const square: Array<[number, number]> = [
      [6.0, 3.0],
      [6.0, 4.0],
      [7.0, 4.0],
      [7.0, 3.0],
    ];
    expect(isInsidePolygon(square, { lat: 6.5, lng: 3.5 })).toBe(true);
    expect(isInsidePolygon(square, { lat: 6.5, lng: 4.5 })).toBe(false);
  });

  it("treats a polygon with too few points as unenterable", () => {
    const sliver = zone({ radiusMeters: null, centerLatitude: null, centerLongitude: null, coordinates: [[6, 3], [6, 4]] });
    expect(isInsideZone(sliver, { lat: 6, lng: 3.5 })).toBe(false);
  });
});

describe("Zone schedules", () => {
  const scheduled = zone({
    scheduleEnabled: true,
    scheduleDays: ["mon", "tue", "wed", "thu", "fri"],
    scheduleStartTime: "08:00",
    scheduleEndTime: "17:00",
    scheduleTimezone: "UTC",
  });

  it("arms a zone inside its window", () => {
    expect(zoneIsArmed(scheduled, new Date("2026-09-07T09:00:00.000Z"))).toBe(true);
  });

  it("disarms it outside the window and at the weekend", () => {
    expect(zoneIsArmed(scheduled, new Date("2026-09-07T19:00:00.000Z"))).toBe(false);
    expect(zoneIsArmed(scheduled, new Date("2026-09-05T09:00:00.000Z"))).toBe(false);
  });

  // An overnight window ends on the following day.
  it("handles a window that crosses midnight", () => {
    const overnight = zone({
      scheduleEnabled: true,
      scheduleDays: [],
      scheduleStartTime: "22:00",
      scheduleEndTime: "05:00",
      scheduleTimezone: "UTC",
    });
    expect(zoneIsArmed(overnight, new Date("2026-09-07T23:30:00.000Z"))).toBe(true);
    expect(zoneIsArmed(overnight, new Date("2026-09-07T03:00:00.000Z"))).toBe(true);
    expect(zoneIsArmed(overnight, new Date("2026-09-07T12:00:00.000Z"))).toBe(false);
  });

  it("stays armed when no schedule is set", () => {
    expect(zoneIsArmed(zone(), new Date())).toBe(true);
  });
});

describe("Geofence evaluation", () => {
  let evaluator: GeofenceEvaluatorService;
  let occupancy: InMemoryZoneOccupancyRepository;

  beforeEach(() => {
    ({ evaluator, occupancy } = buildEvaluator([zone()]));
  });

  const inside = { tenantId: "tenant-a", vehicleId: "v1", point: { lat: 6.4440, lng: 3.3650 } };
  const outside = { tenantId: "tenant-a", vehicleId: "v1", point: LEKKI };

  it("raises an entry alert the first time a vehicle is seen inside", async () => {
    const alerts = await evaluator.evaluate(inside);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ type: "geofence_entry", zoneId: "zone-1" });
  });

  // Every position inside the zone would otherwise raise another entry.
  it("does not re-raise entry while the vehicle stays inside", async () => {
    await evaluator.evaluate(inside);
    expect(await evaluator.evaluate(inside)).toHaveLength(0);
  });

  it("raises an exit when the vehicle leaves, and clears occupancy", async () => {
    await evaluator.evaluate(inside);
    const alerts = await evaluator.evaluate(outside);

    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe("geofence_exit");
    expect(await occupancy.findByVehicle("tenant-a", "v1")).toHaveLength(0);
  });

  it("counts vehicles currently inside for the zone chip", async () => {
    await evaluator.evaluate(inside);
    await evaluator.evaluate({ ...inside, vehicleId: "v2" });

    expect((await evaluator.occupantCounts("tenant-a")).get("zone-1")).toBe(2);
    expect(await evaluator.occupants("tenant-a", "zone-1")).toHaveLength(2);
  });

  it("ignores a vehicle the zone is not watching", async () => {
    ({ evaluator } = buildEvaluator([zone({ assignedVehicleIds: ["other"] })]));
    expect(await evaluator.evaluate(inside)).toHaveLength(0);
  });

  it("honours the entry and exit toggles independently", async () => {
    ({ evaluator } = buildEvaluator([zone({ entryAlertsEnabled: false })]));
    expect(await evaluator.evaluate(inside)).toHaveLength(0);

    // Membership is still recorded, so leaving is still an exit.
    const exit = await evaluator.evaluate(outside);
    expect(exit.map((alert) => alert.type)).toEqual(["geofence_exit"]);
  });

  it("raises a dwell once the vehicle has been inside long enough", async () => {
    ({ evaluator } = buildEvaluator([
      zone({ dwellAlertsEnabled: true, dwellMinutes: 30, entryAlertsEnabled: false }),
    ]));

    const arrival = new Date("2026-09-07T10:00:00.000Z");
    await evaluator.evaluate({ ...inside, at: arrival });

    const early = await evaluator.evaluate({ ...inside, at: new Date("2026-09-07T10:20:00.000Z") });
    expect(early).toHaveLength(0);

    const late = await evaluator.evaluate({ ...inside, at: new Date("2026-09-07T10:35:00.000Z") });
    expect(late).toHaveLength(1);
    expect(late[0]).toMatchObject({ type: "geofence_dwell" });
    expect(late[0].details["minutesInside"]).toBe(35);
  });

  // A vehicle parked in a depot would otherwise alert on every position.
  it("raises a dwell only once per stay", async () => {
    ({ evaluator } = buildEvaluator([
      zone({ dwellAlertsEnabled: true, dwellMinutes: 30, entryAlertsEnabled: false }),
    ]));

    await evaluator.evaluate({ ...inside, at: new Date("2026-09-07T10:00:00.000Z") });
    await evaluator.evaluate({ ...inside, at: new Date("2026-09-07T10:35:00.000Z") });
    const again = await evaluator.evaluate({ ...inside, at: new Date("2026-09-07T10:40:00.000Z") });

    expect(again).toHaveLength(0);
  });

  it("escalates entry into a restricted area", async () => {
    ({ evaluator } = buildEvaluator([zone({ category: "Restricted Area" })]));
    const alerts = await evaluator.evaluate(inside);
    expect(alerts[0].severity).toBe("high");
  });

  // A vehicle whose device was off can reappear somewhere else entirely; the
  // exit it never reported is still real.
  it("reports an exit for a zone the vehicle silently left", async () => {
    await evaluator.evaluate(inside);
    const alerts = await evaluator.evaluate({ ...outside, at: new Date() });
    expect(alerts.map((alert) => alert.type)).toEqual(["geofence_exit"]);
  });
});
