import { describe, expect, it } from "vitest";
import { FuelThresholdService } from "../../../apps/fleet/src/contexts/fleet/fuel/application/fuel-threshold.service";

describe("FuelThresholdService", () => {
  it("sets and gets a threshold", () => {
    const svc = new FuelThresholdService();
    svc.set("truck", 8);
    expect(svc.get("truck")?.minKmPerLiter).toBe(8);
  });

  it("falls back to default threshold", () => {
    const svc = new FuelThresholdService();
    svc.set("default", 5);
    expect(svc.get("bus")?.minKmPerLiter).toBe(5);
  });

  it("returns null when no threshold and no default", () => {
    const svc = new FuelThresholdService();
    expect(svc.get("truck")).toBeNull();
  });

  it("throws if minKmPerLiter <= 0", () => {
    const svc = new FuelThresholdService();
    expect(() => svc.set("truck", 0)).toThrow("minKmPerLiter must be positive");
    expect(() => svc.set("truck", -1)).toThrow();
  });

  it("getAll returns all configured thresholds", () => {
    const svc = new FuelThresholdService();
    svc.set("truck", 8);
    svc.set("van", 12);
    expect(svc.getAll()).toHaveLength(2);
  });

  it("delete removes threshold", () => {
    const svc = new FuelThresholdService();
    svc.set("truck", 8);
    expect(svc.delete("truck")).toBe(true);
    expect(svc.get("truck")).toBeNull();
  });

  it("overrides existing threshold", () => {
    const svc = new FuelThresholdService();
    svc.set("truck", 8);
    svc.set("truck", 10);
    expect(svc.get("truck")?.minKmPerLiter).toBe(10);
    expect(svc.getAll()).toHaveLength(1);
  });
});
