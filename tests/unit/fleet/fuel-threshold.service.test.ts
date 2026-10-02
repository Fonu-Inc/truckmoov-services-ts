import { describe, expect, it } from "vitest";
import { FuelThresholdService } from "../../../apps/fleet/src/contexts/fleet/fuel/application/fuel-threshold.service";
import { InMemoryFuelThresholdRepository } from "../../../apps/fleet/src/contexts/fleet/fuel/infrastructure/in-memory-fuel-threshold.repository";

const build = () => new FuelThresholdService(new InMemoryFuelThresholdRepository());

describe("FuelThresholdService", () => {
  it("sets and gets a threshold", async () => {
    const svc = build();
    await svc.set("t1", "truck", 8);
    expect((await svc.get("t1", "truck"))?.minKmPerLiter).toBe(8);
  });

  it("falls back to default threshold", async () => {
    const svc = build();
    await svc.set("t1", "default", 5);
    expect((await svc.get("t1", "bus"))?.minKmPerLiter).toBe(5);
  });

  it("returns null when no threshold and no default", async () => {
    expect(await build().get("t1", "truck")).toBeNull();
  });

  it("throws if minKmPerLiter <= 0", async () => {
    const svc = build();
    await expect(svc.set("t1", "truck", 0)).rejects.toThrow("minKmPerLiter must be positive");
    await expect(svc.set("t1", "truck", -1)).rejects.toThrow();
  });

  it("getAll returns all configured thresholds", async () => {
    const svc = build();
    await svc.set("t1", "truck", 8);
    await svc.set("t1", "van", 12);
    expect(await svc.getAll("t1")).toHaveLength(2);
  });

  it("delete removes threshold", async () => {
    const svc = build();
    await svc.set("t1", "truck", 8);
    expect(await svc.delete("t1", "truck")).toBe(true);
    expect(await svc.get("t1", "truck")).toBeNull();
  });

  it("overrides existing threshold", async () => {
    const svc = build();
    await svc.set("t1", "truck", 8);
    await svc.set("t1", "truck", 10);
    expect((await svc.get("t1", "truck"))?.minKmPerLiter).toBe(10);
    expect(await svc.getAll("t1")).toHaveLength(1);
  });

  it("keeps each tenant's thresholds apart", async () => {
    const svc = build();
    await svc.set("t1", "truck", 8);
    await svc.set("t2", "truck", 12);
    expect((await svc.get("t1", "truck"))?.minKmPerLiter).toBe(8);
    expect((await svc.get("t2", "truck"))?.minKmPerLiter).toBe(12);
    expect(await svc.getAll("t3")).toEqual([]);
    expect(await svc.delete("t2", "truck")).toBe(true);
    expect((await svc.get("t1", "truck"))?.minKmPerLiter).toBe(8);
  });
});
