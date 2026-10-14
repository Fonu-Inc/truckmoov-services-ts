import { describe, expect, it, vi } from "vitest";
import { RoadSpeedEvaluatorService } from "../../../apps/fleet/src/contexts/fleet/tracking/application/road-speed-evaluator.service";
import { RouteDeviationService } from "../../../apps/fleet/src/contexts/fleet/tracking/application/route-deviation.service";
import type { RoadMatchedFix } from "../../../apps/fleet/src/contexts/fleet/tracking/domain/road-matched-fix";
import {
  defaultLimitKph,
  lowestDefaultKph,
} from "../../../apps/fleet/src/contexts/fleet/tracking/domain/road-speed-limits";
import { InMemoryRoadSpeedRepository } from "../../../apps/fleet/src/contexts/fleet/tracking/infrastructure/in-memory-road-speed.repository";
import type { PositionedZone, StoredGeofenceZone } from "../../../apps/fleet/src/geofence-zone.repository";
import { decodePolyline } from "../../../apps/fleet/src/utils/polyline";

const DEFAULTS = { highwayOpenKph: 80, highwayTownKph: 40, mainOpenKph: 60, mainTownKph: 40, minorKph: 40 };
const config = {
  roadSpeed: { ...DEFAULTS, confirmWithinSeconds: 120, alertCooldownMinutes: 15 },
  routeDeviation: { bufferMeters: 100, confirmFixes: 2 },
} as never;

function fix(overrides: Partial<RoadMatchedFix> = {}): RoadMatchedFix {
  return {
    tenantId: "t1",
    vehicleId: "v1",
    point: { lat: 7.0, lng: 3.6 },
    speedKph: 70,
    roadClass: "trunk",
    roadName: "Lagos-Ibadan Expressway",
    osmSpeedLimitKph: null,
    wayId: 1,
    at: new Date("2026-10-13T09:00:00.000Z"),
    ...overrides,
  };
}

describe("road speed limits", () => {
  it("gives highways and main roads a lower limit in town, minor roads one limit", () => {
    expect(defaultLimitKph("motorway", false, DEFAULTS)).toBe(80);
    expect(defaultLimitKph("trunk", true, DEFAULTS)).toBe(40);
    expect(defaultLimitKph("secondary", false, DEFAULTS)).toBe(60);
    expect(defaultLimitKph("primary", true, DEFAULTS)).toBe(40);
    expect(defaultLimitKph("residential", false, DEFAULTS)).toBe(40);
    expect(defaultLimitKph("service_other", true, DEFAULTS)).toBe(40);
    expect(lowestDefaultKph(DEFAULTS)).toBe(40);
  });
});

describe("polyline decoding", () => {
  it("decodes Google's reference polyline", () => {
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@", 5)).toEqual([
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ]);
  });
});

describe("road speed evaluation", () => {
  const at = (seconds: number) => new Date(Date.parse("2026-10-13T09:00:00.000Z") + seconds * 1000);

  function evaluator(options: { inTown?: boolean; zones?: PositionedZone[] } = {}) {
    const roads = new InMemoryRoadSpeedRepository();
    const isBuiltUp = vi.spyOn(roads, "isBuiltUp").mockResolvedValue(options.inTown ?? false);
    const zones = { findForPosition: vi.fn().mockResolvedValue(options.zones ?? []) };
    const service = new RoadSpeedEvaluatorService(roads, zones as never, config);
    // Two breaches 20 s apart: the first only arms, the second alerts.
    const twice = async (overrides: Partial<RoadMatchedFix>, start = 0) => {
      await service.evaluate(fix({ ...overrides, at: at(start) }));
      return service.evaluate(fix({ ...overrides, at: at(start + 20) }));
    };
    return { service, isBuiltUp, twice };
  }

  it("alerts over the open-road highway default and says the limit is a default", async () => {
    const { twice } = evaluator();
    const alert = await twice({ speedKph: 92 });
    expect(alert).toMatchObject({ type: "road_speeding", severity: "medium" });
    expect(alert?.details).toMatchObject({ limitKph: 80, limitSource: "default", inTown: false, speedKph: 92 });
  });

  // One GPS speed spike, or one snap onto a side road, must not alert.
  it("needs a second breach within the confirm window", async () => {
    const { service } = evaluator();
    expect(await service.evaluate(fix({ speedKph: 92, at: at(0) }))).toBeNull();
    expect(await service.evaluate(fix({ speedKph: 92, at: at(300) }))).toBeNull();
    expect(await service.evaluate(fix({ speedKph: 92, at: at(330) }))).not.toBeNull();
  });

  it("uses the town limit on a highway through a town", async () => {
    const { twice } = evaluator({ inTown: true });
    expect((await twice({ speedKph: 55 }))?.details).toMatchObject({ limitKph: 40, inTown: true });
  });

  it("prefers the posted OSM limit and needs no town lookup for it", async () => {
    const { twice, isBuiltUp } = evaluator();
    expect(await twice({ speedKph: 55, osmSpeedLimitKph: 60 })).toBeNull();
    const alert = await twice({ speedKph: 65, osmSpeedLimitKph: 60 }, 60);
    expect(alert?.details).toMatchObject({ limitKph: 60, limitSource: "osm" });
    expect(isBuiltUp).not.toHaveBeenCalled();
  });

  it("skips the lookup below the lowest default", async () => {
    const { twice, isBuiltUp } = evaluator();
    expect(await twice({ speedKph: 35 })).toBeNull();
    expect(isBuiltUp).not.toHaveBeenCalled();
  });

  it("leaves a breach inside a speed-limited zone to the zone", async () => {
    const zone = { speedLimitEnabled: true, speedLimitKph: 30, scheduleEnabled: false, assignedVehicleIds: [] } as unknown as StoredGeofenceZone;
    const { twice } = evaluator({ zones: [{ zone, inside: true }] });
    expect(await twice({ speedKph: 95 })).toBeNull();
  });

  // Matching can flick between road names; the cooldown is per vehicle so that cannot re-alert.
  it("stays quiet for the cooldown whatever road the truck is on", async () => {
    const { twice } = evaluator();
    expect(await twice({ speedKph: 92 })).not.toBeNull();
    expect(await twice({ speedKph: 95, roadName: "Sagamu Interchange" }, 60)).toBeNull();
    expect(await twice({ speedKph: 95, roadName: "Sagamu Interchange" }, 16 * 60)).not.toBeNull();
  });

  it("marks a breach of 30 km/h or more as high severity", async () => {
    const { twice } = evaluator();
    expect((await twice({ speedKph: 110 }))?.severity).toBe("high");
  });
});

describe("route deviation", () => {
  const routes = () => ({ replace: vi.fn(), removeJob: vi.fn(), checkFix: vi.fn().mockResolvedValue(null) });

  it("stores the job's planned line, decoded leg by leg, when the job becomes active", async () => {
    const repo = routes();
    const dispatch = {
      listActiveJobsMap: vi.fn().mockResolvedValue({
        jobs: [{ jobId: "j1", routeShape: "_p~iF~ps|U;_ulLnnqC", routeEncoding: "polyline6" }],
      }),
    };
    const service = new RouteDeviationService(repo as never, dispatch as never, config);

    await service.syncJob({ tenantId: "t1", jobId: "j1", newStatus: "en-route", vehicleId: "v1" });
    expect(repo.removeJob).toHaveBeenCalledWith("t1", "j1");
    expect(repo.replace).toHaveBeenCalledWith("t1", "v1", "j1", [
      { lat: 3.85, lng: -12.02 },
      { lat: 0.22, lng: -0.075 },
    ]);
  });

  it("drops the route when the job ends", async () => {
    const repo = routes();
    const dispatch = { listActiveJobsMap: vi.fn() };
    const service = new RouteDeviationService(repo as never, dispatch as never, config);

    await service.syncJob({ tenantId: "t1", jobId: "j1", newStatus: "delivered", vehicleId: "v1" });
    expect(repo.removeJob).toHaveBeenCalledWith("t1", "j1");
    expect(repo.replace).not.toHaveBeenCalled();
    expect(dispatch.listActiveJobsMap).not.toHaveBeenCalled();
  });

  it("raises a deviation for the job once the repository confirms it", async () => {
    const repo = routes();
    repo.checkFix.mockResolvedValueOnce(null).mockResolvedValueOnce("j1");
    const service = new RouteDeviationService(repo as never, { listActiveJobsMap: vi.fn() } as never, config);

    expect(await service.check(fix())).toBeNull();
    const alert = await service.check(fix());
    expect(alert).toMatchObject({ type: "route_deviation", jobId: "j1" });
    expect(repo.checkFix).toHaveBeenLastCalledWith("t1", "v1", { lat: 7.0, lng: 3.6 }, 100, 2);
  });
});
