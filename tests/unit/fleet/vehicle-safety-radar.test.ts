import { describe, expect, it } from "vitest";
import { FleetAnalyticsUseCase } from "../../../apps/fleet/src/fleet-analytics.use-case";

const vehicles = [
  { id: "v1", plateNumber: "ONE", status: "active", type: "truck", assignedDriverId: "d1" },
  { id: "v2", plateNumber: "TWO", status: "active", type: "truck", assignedDriverId: "d2" },
];
const drivers = [
  { id: "d1", name: "Ade", status: "active", assignedVehicleId: "v1" },
  { id: "d2", name: "Bola", status: "active", assignedVehicleId: "v2" },
];

function alert(id: string, type: string, vehicleId: string | null, triggeredAt = new Date()) {
  return { id, type, severity: "high", status: "open", vehicleId, jobId: null, details: {}, triggeredAt };
}

function analyticsWith(alerts: unknown[]) {
  return new FleetAnalyticsUseCase(
    { findAll: async () => vehicles } as never,
    { findAll: async () => drivers } as never,
    { listJobs: async () => [] } as never,
    { findAll: async () => alerts } as never,
  );
}

const NULL_AXES = { braking: null, acceleration: null, speedControl: null, cornering: null };

describe("fleet safety radar", () => {
  it("reports null axes, not a perfect 100, when no driver event was scored", async () => {
    const useCase = analyticsWith([]);

    expect(await useCase.driverScores("t1", 30)).toEqual([]);
    expect(await useCase.vehicleSafetyRadar("t1", 30)).toEqual({ ...NULL_AXES, periodDays: 30 });
  });

  it("stays null when the only events are outside the period or on no driver's vehicle", async () => {
    const old = new Date(Date.now() - 60 * 86_400_000);
    const useCase = analyticsWith([alert("a1", "harsh_braking", "v1", old), alert("a2", "harsh_braking", null)]);

    expect(await useCase.vehicleSafetyRadar("t1", 7)).toEqual({ ...NULL_AXES, periodDays: 7 });
  });

  it("averages across the fleet's drivers once one event is scored", async () => {
    const useCase = analyticsWith([alert("a1", "harsh_braking", "v1")]);

    expect(await useCase.vehicleSafetyRadar("t1", 30)).toEqual({
      braking: 99,
      acceleration: 100,
      speedControl: 100,
      cornering: 100,
      periodDays: 30,
    });
  });
});
