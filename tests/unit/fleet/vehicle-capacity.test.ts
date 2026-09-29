import { describe, expect, it } from "vitest";
import {
  assertCapacityWithinRange,
  capacityPallets,
  capacityVolumeM3,
  capacityWeightKg,
  normalizeCapacityUnit,
  VehicleCapacityError,
} from "../../../apps/fleet/src/contexts/fleet/vehicles/domain/vehicle-capacity";
import { resolveVehicleTab } from "../../../apps/fleet/src/contexts/fleet/vehicles/domain/vehicle-tabs";

describe("Vehicle capacity units", () => {
  it("accepts the five units the form offers, and common spellings", () => {
    expect(normalizeCapacityUnit("kg")).toBe("kg");
    expect(normalizeCapacityUnit("Kilograms")).toBe("kg");
    expect(normalizeCapacityUnit("lbs")).toBe("lb");
    expect(normalizeCapacityUnit("Tonnes")).toBe("tons");
    expect(normalizeCapacityUnit("m³")).toBe("m3");
    expect(normalizeCapacityUnit("Pallet")).toBe("pallets");
  });

  it("defaults to tons when no unit is given", () => {
    expect(normalizeCapacityUnit(undefined)).toBe("tons");
    expect(normalizeCapacityUnit(null)).toBe("tons");
    expect(normalizeCapacityUnit("")).toBe("tons");
  });

  it("rejects a unit it does not know", () => {
    expect(() => normalizeCapacityUnit("stones")).toThrow(VehicleCapacityError);
  });

  it("converts the mass units to kilograms", () => {
    expect(capacityWeightKg(30, "tons")).toBe(30_000);
    expect(capacityWeightKg(1500, "kg")).toBe(1500);
    expect(capacityWeightKg(1000, "lb")).toBe(453.59);
  });

  // Volume and a pallet count are not masses. Reporting a weight for them
  // would put a fabricated number in front of dispatch capacity checks.
  it("reports no weight for volume or pallet capacities", () => {
    expect(capacityWeightKg(40, "m3")).toBeNull();
    expect(capacityWeightKg(26, "pallets")).toBeNull();
    expect(capacityVolumeM3(40, "m3")).toBe(40);
    expect(capacityVolumeM3(30, "tons")).toBeNull();
    expect(capacityPallets(26, "pallets")).toBe(26);
    expect(capacityPallets(30, "tons")).toBeNull();
  });

  it("returns null when there is no capacity at all", () => {
    expect(capacityWeightKg(null, "tons")).toBeNull();
    expect(capacityVolumeM3(null, "m3")).toBeNull();
    expect(capacityPallets(null, "pallets")).toBeNull();
  });

  // 100 is a sane ton ceiling and a nonsensical kilogram one.
  it("bounds capacity per unit rather than globally", () => {
    expect(() => assertCapacityWithinRange(100, "tons")).not.toThrow();
    expect(() => assertCapacityWithinRange(101, "tons")).toThrow(VehicleCapacityError);
    expect(() => assertCapacityWithinRange(30_000, "kg")).not.toThrow();
    expect(() => assertCapacityWithinRange(-1, "kg")).toThrow(VehicleCapacityError);
  });
});

describe("Vehicle page tabs", () => {
  it("resolves each tab name", () => {
    for (const tab of ["vehicles", "maintenance", "fuel", "compliance", "financials", "analytics"]) {
      expect(resolveVehicleTab(tab)).toBe(tab);
    }
    expect(resolveVehicleTab("  FUEL ")).toBe("fuel");
  });

  it("falls back to the vehicles list for a missing or unknown tab", () => {
    expect(resolveVehicleTab(undefined)).toBe("vehicles");
    expect(resolveVehicleTab("")).toBe("vehicles");
    expect(resolveVehicleTab("trips")).toBe("vehicles");
  });
});
