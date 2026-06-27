import { describe, expect, it, vi } from "vitest";
import { RecordFuelUseCase } from "../../../apps/fleet/src/contexts/fleet/fuel/application/record-fuel.use-case";
import { FuelThresholdService } from "../../../apps/fleet/src/contexts/fleet/fuel/application/fuel-threshold.service";
import { InMemoryFuelRecordRepository } from "../../../apps/fleet/src/contexts/fleet/fuel/infrastructure/in-memory-fuel-record.repository";

function build() {
  const repo = new InMemoryFuelRecordRepository();
  const runtime = { generateId: () => crypto.randomUUID(), getDefaultTenantId: () => "t1" };
  const triggerAlert = { execute: vi.fn().mockResolvedValue(undefined) };
  const thresholds = new FuelThresholdService();
  const vehicleRepo = { findById: vi.fn().mockResolvedValue(null) };
  const uc = new RecordFuelUseCase(repo, runtime as any, triggerAlert as any, thresholds, vehicleRepo as any);
  return { repo, uc, triggerAlert, thresholds, vehicleRepo };
}

describe("RecordFuelUseCase", () => {
  it("saves and returns fuel record", async () => {
    const { uc, repo } = build();
    const r = await uc.execute({ vehicleId: "v1", liters: 50, pricePerLiter: 1.5, recordedBy: "u1" });
    expect(r.vehicleId).toBe("v1");
    expect(r.totalCost).toBe(75);
    expect(await repo.findById(r.id, "t1")).not.toBeNull();
  });

  it("uses default tenantId from runtime", async () => {
    const { uc } = build();
    const r = await uc.execute({ vehicleId: "v1", liters: 10, pricePerLiter: 1, recordedBy: "u1" });
    expect(r.tenantId).toBe("t1");
  });

  it("adds create audit entry", async () => {
    const { uc } = build();
    const r = await uc.execute({ vehicleId: "v1", liters: 10, pricePerLiter: 1, recordedBy: "u1" });
    expect(r.auditTrail[0].action).toBe("create");
    expect(r.auditTrail[0].by).toBe("u1");
  });

  it("does not trigger alert when no threshold configured", async () => {
    const { uc, triggerAlert } = build();
    await uc.execute({ vehicleId: "v1", liters: 50, pricePerLiter: 1, odometer: 5000, recordedBy: "u1" });
    await uc.execute({ vehicleId: "v1", liters: 50, pricePerLiter: 1, odometer: 5400, recordedBy: "u1" });
    expect(triggerAlert.execute).not.toHaveBeenCalled();
  });

  it("triggers alert when efficiency is below threshold", async () => {
    const { uc, triggerAlert, thresholds } = build();
    thresholds.set("truck", 15);
    // 400 km / 50 L = 8 km/L < 15 threshold
    await uc.execute({ vehicleId: "v1", vehicleType: "truck", liters: 10, pricePerLiter: 1, odometer: 5000, recordedBy: "u1" });
    await uc.execute({ vehicleId: "v1", vehicleType: "truck", liters: 50, pricePerLiter: 1, odometer: 5400, recordedBy: "u1" });
    expect(triggerAlert.execute).toHaveBeenCalledWith(
      expect.objectContaining({ type: "low_fuel_efficiency", vehicleId: "v1" }),
    );
  });

  it("does not trigger alert when efficiency is above threshold", async () => {
    const { uc, triggerAlert, thresholds } = build();
    thresholds.set("truck", 5);
    // 400 km / 50 L = 8 km/L > 5 threshold
    await uc.execute({ vehicleId: "v1", vehicleType: "truck", liters: 10, pricePerLiter: 1, odometer: 5000, recordedBy: "u1" });
    await uc.execute({ vehicleId: "v1", vehicleType: "truck", liters: 50, pricePerLiter: 1, odometer: 5400, recordedBy: "u1" });
    expect(triggerAlert.execute).not.toHaveBeenCalled();
  });

  it("does not trigger alert with only one odometer reading", async () => {
    const { uc, triggerAlert, thresholds } = build();
    thresholds.set("default", 20);
    await uc.execute({ vehicleId: "v1", liters: 50, pricePerLiter: 1, odometer: 5000, recordedBy: "u1" });
    expect(triggerAlert.execute).not.toHaveBeenCalled();
  });
});
