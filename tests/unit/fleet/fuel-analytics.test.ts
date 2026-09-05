import { describe, expect, it } from "vitest";
import {
  applyFuelFilters,
  buildWeeklyFuelSeries,
  type FuelRecordView,
} from "../../../apps/fleet/src/contexts/fleet/fuel/domain/fuel-analytics";

function record(overrides: Partial<FuelRecordView> = {}): FuelRecordView {
  return {
    fuelType: "diesel",
    liters: 100,
    totalCost: 80_000,
    station: "Mobil Ikorodu Rd",
    recordedAt: "2026-09-02T10:00:00.000Z",
    vehiclePlateNumber: "LAG-234-XY",
    driverName: "Chukwuemeka Okafor",
    ...overrides,
  };
}

describe("Fuel filters", () => {
  it("matches the search box across vehicle, driver and station", () => {
    const records = [
      record({ vehiclePlateNumber: "LAG-234-XY", driverName: "Ada", station: "Oando Apapa" }),
      record({ vehiclePlateNumber: "LAG-112-EF", driverName: "Musa", station: "Total Wuse II" }),
    ];

    expect(applyFuelFilters(records, { query: "wuse" })).toHaveLength(1);
    expect(applyFuelFilters(records, { query: "ada" })).toHaveLength(1);
    expect(applyFuelFilters(records, { query: "LAG-234" })).toHaveLength(1);
    expect(applyFuelFilters(records, { query: "nothing" })).toHaveLength(0);
  });

  it("filters by fuel type, litre range and total range together", () => {
    const records = [
      record({ fuelType: "diesel", liters: 180.5, totalCost: 144_400 }),
      record({ fuelType: "petrol", liters: 75.2, totalCost: 64_672 }),
      record({ fuelType: "diesel", liters: 220, totalCost: 178_200 }),
    ];

    expect(applyFuelFilters(records, { fuelType: "petrol" })).toHaveLength(1);
    expect(applyFuelFilters(records, { litresFrom: 100, litresTo: 200 })).toHaveLength(1);
    expect(applyFuelFilters(records, { totalFrom: 100_000 })).toHaveLength(2);
    expect(
      applyFuelFilters(records, { fuelType: "diesel", litresFrom: 200, totalTo: 200_000 }),
    ).toHaveLength(1);
  });

  it("returns everything when no criteria are given", () => {
    const records = [record(), record({ fuelType: "petrol" })];
    expect(applyFuelFilters(records, {})).toHaveLength(2);
  });
});

describe("Weekly fuel series", () => {
  it("splits litres by weekday and fuel type", () => {
    const series = buildWeeklyFuelSeries([
      // Wednesday
      record({ recordedAt: "2026-09-02T08:00:00.000Z", fuelType: "diesel", liters: 180 }),
      record({ recordedAt: "2026-09-02T18:00:00.000Z", fuelType: "petrol", liters: 75 }),
      // Friday
      record({ recordedAt: "2026-09-04T09:00:00.000Z", fuelType: "diesel", liters: 200 }),
    ]);

    expect(series.fuelTypes).toEqual(["diesel", "petrol"]);
    const wednesday = series.days.find((day) => day.day === "Wed");
    expect(wednesday?.litres).toEqual({ diesel: 180, petrol: 75 });
    expect(wednesday?.totalLitres).toBe(255);

    const friday = series.days.find((day) => day.day === "Fri");
    expect(friday?.litres.diesel).toBe(200);
    expect(friday?.litres.petrol).toBe(0);
  });

  // The chart must keep its shape on a quiet week rather than collapsing bars.
  it("always returns all seven days", () => {
    const series = buildWeeklyFuelSeries([record({ recordedAt: "2026-09-02T08:00:00.000Z" })]);
    expect(series.days.map((day) => day.day)).toEqual([
      "Sun",
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
    ]);
  });

  it("ignores records with an unreadable timestamp", () => {
    const series = buildWeeklyFuelSeries([
      record({ recordedAt: "not-a-date", liters: 500 }),
      record({ recordedAt: null, createdAt: null, liters: 500 }),
      record({ recordedAt: "2026-09-02T08:00:00.000Z", liters: 10 }),
    ]);

    expect(series.days.reduce((total, day) => total + day.totalLitres, 0)).toBe(10);
  });

  it("falls back to createdAt when there is no recordedAt", () => {
    const series = buildWeeklyFuelSeries([
      record({ recordedAt: null, createdAt: "2026-09-01T08:00:00.000Z", liters: 40 }),
    ]);

    expect(series.days.find((day) => day.day === "Tue")?.totalLitres).toBe(40);
  });
});
