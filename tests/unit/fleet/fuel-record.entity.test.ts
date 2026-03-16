import { describe, expect, it } from "vitest";
import { FuelRecord } from "../../../apps/fleet/src/contexts/fleet/fuel/domain/entities/fuel-record.entity";

function makeRecord(overrides: Partial<Parameters<typeof FuelRecord.create>[0]> = {}) {
  return FuelRecord.create({
    id: "fr-1", tenantId: "t1", vehicleId: "v1", driverId: null, vehicleType: "truck",
    liters: 50, pricePerLiter: 1.5, station: "BP Lagos", odometer: 10000,
    recordedAt: "2026-03-01T08:00:00.000Z", recordedBy: "user-1",
    deletedAt: null, auditTrail: [], ...overrides,
  });
}

describe("FuelRecord", () => {
  it("computes totalCost automatically", () => {
    const r = makeRecord({ liters: 40, pricePerLiter: 2 });
    expect(r.totalCost).toBe(80);
  });

  it("accepts explicit totalCost override", () => {
    const r = FuelRecord.create({
      id: "x", tenantId: "t", vehicleId: "v", driverId: null, vehicleType: null,
      liters: 10, pricePerLiter: 1, totalCost: 999,
      station: null, odometer: null, recordedAt: new Date().toISOString(),
      recordedBy: "u", deletedAt: null, auditTrail: [],
    });
    expect(r.totalCost).toBe(999);
  });

  it("throws if liters <= 0", () => {
    expect(() => makeRecord({ liters: 0 })).toThrow("liters must be positive");
    expect(() => makeRecord({ liters: -1 })).toThrow();
  });

  it("throws if pricePerLiter < 0", () => {
    expect(() => makeRecord({ pricePerLiter: -1 })).toThrow("pricePerLiter must be non-negative");
  });

  it("update returns new instance with recomputed cost and audit entry", () => {
    const r = makeRecord({ liters: 50, pricePerLiter: 1.5 });
    const updated = r.update({ liters: 60, pricePerLiter: 2 }, "admin");
    expect(updated.liters).toBe(60);
    expect(updated.pricePerLiter).toBe(2);
    expect(updated.totalCost).toBe(120);
    expect(updated.auditTrail.at(-1)?.action).toBe("edit");
    expect(updated.auditTrail.at(-1)?.by).toBe("admin");
    expect(r.liters).toBe(50);
  });

  it("softDelete sets deletedAt and adds audit entry", () => {
    const r = makeRecord();
    const deleted = r.softDelete("admin");
    expect(deleted.isDeleted).toBe(true);
    expect(deleted.deletedAt).not.toBeNull();
    expect(deleted.auditTrail.at(-1)?.action).toBe("delete");
    expect(r.isDeleted).toBe(false);
  });

  it("toPrimitives returns all fields", () => {
    const r = makeRecord();
    const p = r.toPrimitives();
    expect(p.vehicleId).toBe("v1");
    expect(p.liters).toBe(50);
    expect(p.auditTrail).toEqual([]);
  });
});
