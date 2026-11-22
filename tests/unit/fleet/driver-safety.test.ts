import { describe, expect, it } from "vitest";
import { deliveredRevenue, fleetSafetyScore, scoreDrivers } from "../../../apps/fleet/src/contexts/fleet/reports/domain/driver-safety";

describe("driver safety scores", () => {
  const vehicles = [
    { id: "v1", assignedDriverId: "d1" },
    { id: "v2", assignedDriverId: "d2" },
    { id: "v3", assignedDriverId: null },
  ];
  const drivers = [
    { id: "d1", name: "Ada" },
    { id: "d2", name: "Bayo" },
    { id: "d3", name: "Unassigned" },
  ];

  it("lists every assigned driver, unscored ones last with a null score", () => {
    const scores = scoreDrivers(vehicles, drivers, [
      { vehicleId: "v1", type: "harsh_braking" },
      { vehicleId: "v3", type: "overspeeding" },
    ]);
    expect(scores.map((s) => [s.driverId, s.safetyScore])).toEqual([["d1", 98], ["d2", null]]);
    expect(scores[0]).toMatchObject({ incidents: 1, harshBraking: 1 });
    expect(fleetSafetyScore(scores)).toBe(98);
  });

  it("has no fleet score when nobody was scored", () => {
    expect(fleetSafetyScore(scoreDrivers(vehicles, drivers, []))).toBeNull();
  });

  it("counts revenue of delivered jobs on the given vehicles since the cutoff", () => {
    const job = (id: string, status: string, vehicle: string | null, deliveredAt: string, amountNgn: number) => ({
      id, reference: id, status, assignedVehicleId: vehicle, assignedDriverId: null, amountNgn,
      createdAt: deliveredAt, updatedAt: deliveredAt, deliveredAt,
      pickupAddress: null, dropoffAddress: null, deadline: null, punctuality: null,
    });
    const jobs = [
      job("a", "delivered", "v1", "2026-05-10T00:00:00.000Z", 1000),
      job("b", "delivered", "v9", "2026-05-10T00:00:00.000Z", 500),
      job("c", "en-route", "v1", "2026-05-10T00:00:00.000Z", 700),
      job("d", "delivered", "v1", "2026-04-01T00:00:00.000Z", 300),
    ];
    expect(deliveredRevenue(jobs, new Set(["v1"]), new Date("2026-05-01T00:00:00.000Z"))).toBe(1000);
  });
});
