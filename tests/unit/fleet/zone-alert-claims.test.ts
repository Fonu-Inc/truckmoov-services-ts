import { describe, expect, it, vi } from "vitest";
import { GeofenceEvaluatorService } from "../../../apps/fleet/src/contexts/fleet/tracking/application/geofence-evaluator.service";
import { InMemoryZoneOccupancyRepository } from "../../../apps/fleet/src/contexts/fleet/tracking/infrastructure/in-memory-zone-occupancy.repository";
import { GeofenceDwellSweepService } from "../../../apps/fleet/src/geofence-dwell-sweep.service";
import { VehicleLocationListener } from "../../../apps/fleet/src/vehicle-location.listener";

const depot = {
  id: "zone-1",
  tenantId: "tenant-a",
  name: "Apapa Depot",
  category: "Depot",
  status: "ACTIVE",
  assignedVehicleIds: [],
  entryAlertsEnabled: true,
  exitAlertsEnabled: true,
  dwellAlertsEnabled: true,
  dwellMinutes: 10,
  speedLimitEnabled: false,
  speedLimitKph: null,
  scheduleEnabled: false,
} as never;

const fix = { tenantId: "tenant-a", vehicleId: "v1", point: { lat: 6.44, lng: 3.36 } };

describe("Zone alerts fire once across replicas", () => {
  // Two replicas handling the same crossing both see "not inside yet"; only the one whose insert lands alerts.
  it("raises one entry alert when the same fix is evaluated twice at once", async () => {
    const zones = { findForPosition: async () => [{ zone: depot, inside: true }] };
    const evaluator = new GeofenceEvaluatorService(zones as never, new InMemoryZoneOccupancyRepository());

    const results = await Promise.all([evaluator.evaluate(fix), evaluator.evaluate(fix)]);

    expect(results.flat().filter((alert) => alert.type === "geofence_entry")).toHaveLength(1);
  });

  it("raises one dwell alert when two sweeps run at once", async () => {
    const occupancy = new InMemoryZoneOccupancyRepository();
    const now = new Date("2026-10-15T12:00:00.000Z");
    await occupancy.enter({
      id: "o1",
      tenantId: "tenant-a",
      vehicleId: "v1",
      zoneId: "zone-1",
      enteredAt: new Date(now.getTime() - 30 * 60_000),
      dwellNotifiedAt: null,
      speedingNotifiedAt: null,
    });
    const bus = { publish: vi.fn(async () => {}) };
    const zones = { findById: async () => depot };
    const sweep = new GeofenceDwellSweepService(bus as never, occupancy, zones as never, {} as never);

    await Promise.all([sweep.sweep(now), sweep.sweep(now)]);

    expect(bus.publish).toHaveBeenCalledTimes(1);
  });
});

describe("Vehicle location listener", () => {
  it("evaluates zones at the fix time and feeds live counts from every instance", async () => {
    const durable: Array<(event: unknown) => Promise<void>> = [];
    const everyInstance: Array<(event: unknown) => Promise<void>> = [];
    const bus = {
      subscribe: async (_s: string, handler: never) => void durable.push(handler),
      subscribeEveryInstance: async (_s: string, handler: never) => void everyInstance.push(handler),
      publish: async () => {},
    };
    const evaluator = { evaluate: vi.fn(async () => []) };
    const liveCounts = { record: vi.fn() };
    const positions = { record: async () => {} };
    const listener = new VehicleLocationListener(bus as never, positions as never, liveCounts as never, evaluator as never);
    await listener.onApplicationBootstrap();

    const event = {
      tenant_id: "tenant-a",
      occurred_at: "2026-10-15T12:05:00.000Z",
      data: { vehicle_id: "v1", lat: 6.44, lng: 3.36, fix_time: "2026-10-15T12:00:00.000Z" },
    };
    await durable[0](event);
    expect(evaluator.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ at: new Date("2026-10-15T12:00:00.000Z") }),
    );
    expect(liveCounts.record).not.toHaveBeenCalled();

    await everyInstance[0](event);
    expect(liveCounts.record).toHaveBeenCalledWith(
      expect.objectContaining({ vehicleId: "v1", fixedAt: "2026-10-15T12:00:00.000Z" }),
    );
  });
});
