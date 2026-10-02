import { describe, expect, it } from "vitest";
import { monthsInWindow, parseAnalyticsRange, trailingMonthWindows } from "../../../apps/fleet/src/contexts/fleet/reports/domain/analytics-range";
import { buildFuelRows, summarizeFuel } from "../../../apps/fleet/src/contexts/fleet/reports/domain/fuel-report";
import { buildUtilizationRows, summarizeUtilization } from "../../../apps/fleet/src/contexts/fleet/reports/domain/utilization";
import { buildCategoryRows } from "../../../apps/fleet/src/contexts/fleet/reports/domain/compliance-audit";

const NOW = new Date("2026-05-20T12:00:00.000Z");

describe("analytics range", () => {
  it("defaults to the last thirty days ending today", () => {
    const range = parseAnalyticsRange(undefined, undefined, NOW);
    expect(range.days).toBe(30);
    expect(range.to).toBe("2026-05-20T23:59:59.999Z");
  });

  it("includes both ends and rejects an inverted range", () => {
    expect(parseAnalyticsRange("2026-05-01", "2026-05-07", NOW).days).toBe(7);
    expect(() => parseAnalyticsRange("2026-05-08", "2026-05-07", NOW)).toThrow();
  });

  it("counts a full month as one and half a month as a half", () => {
    expect(monthsInWindow("2026-05-01T00:00:00.000Z", "2026-05-31T23:59:59.999Z")).toBeCloseTo(1);
    expect(monthsInWindow("2026-06-01T00:00:00.000Z", "2026-06-15T23:59:59.999Z")).toBeCloseTo(0.5);
  });

  it("lists six months ending with a cut last month", () => {
    const windows = trailingMonthWindows("2026-05-20T23:59:59.999Z", 6);
    expect(windows.map((w) => w.month)).toEqual(["2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05"]);
    expect(windows[5].to).toBe("2026-05-20T23:59:59.999Z");
  });
});

describe("utilization", () => {
  const range = parseAnalyticsRange("2026-05-01", "2026-05-10", NOW);
  const vehicles = [
    { id: "v1", plateNumber: "AAA", make: null, model: "Hino", status: "active", type: "truck" },
    { id: "v2", plateNumber: "BBB", make: null, model: "Isuzu", status: "active", type: "truck" },
  ];

  it("counts days with a job on the vehicle and leaves idle vehicles at zero", () => {
    const rows = buildUtilizationRows(
      vehicles,
      [{
        id: "j1", reference: "J1", status: "delivered", assignedVehicleId: "v1", assignedDriverId: null, amountNgn: 1000,
        createdAt: "2026-05-02T08:00:00.000Z", updatedAt: "2026-05-04T08:00:00.000Z",
        pickupAddress: null, dropoffAddress: null, deadline: null, punctuality: null,
      }],
      range,
      NOW.getTime(),
    );
    expect(rows[0]).toMatchObject({ activeDays: 3, utilizationPercent: 30, completedJobs: 1, revenue: 1000 });
    expect(rows[1]).toMatchObject({ activeDays: 0, totalJobs: 0 });
    expect(summarizeUtilization(rows).idleVehicles).toBe(1);
  });
});

describe("fuel report", () => {
  it("measures km per litre from the odometer span and the fills after the first", () => {
    const range = parseAnalyticsRange("2026-05-01", "2026-05-31", NOW);
    const fill = (recordedAt: string, liters: number, odometer: number) => ({
      id: recordedAt, tenantId: "t", vehicleId: "v1", driverId: null, vehicleType: null, fuelType: "diesel",
      liters, pricePerLiter: 100, totalCost: liters * 100, station: null, odometer, recordedAt, recordedBy: "u",
      deletedAt: null, auditTrail: [],
    });
    const { rows, litresForDistance } = buildFuelRows(
      [{ id: "v1", plateNumber: "AAA", make: null, model: "Hino", type: "truck", fuelType: null }],
      [fill("2026-05-02T00:00:00.000Z", 50, 1000), fill("2026-05-10T00:00:00.000Z", 100, 1500)],
      [],
      range,
    );
    expect(rows[0]).toMatchObject({ litres: 150, costNgn: 15000, distanceKm: 500, efficiencyKmPerLitre: 5 });
    expect(summarizeFuel(rows, litresForDistance).avgEfficiencyKmPerLitre).toBe(5);
  });
});

describe("compliance categories", () => {
  it("rates a category by its valid share", () => {
    const rows = buildCategoryRows([
      { category: "Insurance", status: "valid" },
      { category: "Insurance", status: "expired" },
    ]);
    expect(rows[0]).toMatchObject({ total: 2, valid: 1, expired: 1, complianceRatePercent: 50 });
  });
});
