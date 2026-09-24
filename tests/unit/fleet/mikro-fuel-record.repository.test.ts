import { describe, expect, it } from "vitest";
import { FuelRecord } from "../../../apps/fleet/src/contexts/fleet/fuel/domain/entities/fuel-record.entity";
import { InMemoryFuelRecordRepository } from "../../../apps/fleet/src/contexts/fleet/fuel/infrastructure/in-memory-fuel-record.repository";
import {
  fuelRecordWhere,
  toDomain,
  toRow,
} from "../../../apps/fleet/src/contexts/fleet/fuel/infrastructure/mikro-fuel-record.repository";

function record(overrides: Partial<Parameters<typeof FuelRecord.create>[0]> = {}) {
  return FuelRecord.create({
    id: "f1",
    tenantId: "tenant-a",
    vehicleId: "v1",
    driverId: null,
    vehicleType: "truck",
    fuelType: "diesel",
    liters: 40.5,
    pricePerLiter: 1000,
    station: "Total Ikeja",
    odometer: 1200,
    recordedAt: "2026-09-24T10:00:00.000Z",
    recordedBy: "u1",
    deletedAt: null,
    auditTrail: [{ at: "2026-09-24T10:00:00.000Z", by: "u1", action: "create" }],
    ...overrides,
  });
}

describe("Mikro fuel record mapping", () => {
  it("round-trips a record through its row", () => {
    const original = record();

    expect(toDomain(toRow(original)).toPrimitives()).toEqual(original.toPrimitives());
  });

  it("keeps a soft delete across the round trip", () => {
    const deleted = record().softDelete("u2");

    const restored = toDomain(toRow(deleted));

    expect(restored.isDeleted).toBe(true);
    expect(restored.auditTrail.map((entry) => entry.action)).toEqual(["create", "delete"]);
  });

  it("reads decimal strings back as numbers", () => {
    const row = { ...toRow(record()), liters: "40.500", totalCost: "40500.00", odometer: null } as never;

    const restored = toDomain(row);

    expect(restored.liters).toBe(40.5);
    expect(restored.totalCost).toBe(40500);
    expect(restored.odometer).toBeNull();
  });
});

describe("Mikro fuel record filters", () => {
  it("scopes to the tenant and hides deleted records by default", () => {
    expect(fuelRecordWhere({ tenantId: "tenant-a" })).toEqual({ tenantId: "tenant-a", deletedAt: null });
  });

  it("treats a date-only upper bound as the end of that day", () => {
    const where = fuelRecordWhere({ tenantId: "tenant-a", from: "2026-09-01", to: "2026-09-24" });

    expect(where.recordedAt).toEqual({
      $gte: new Date("2026-09-01"),
      $lte: new Date("2026-09-24T23:59:59.999Z"),
    });
  });

  it("matches station text literally", () => {
    expect(fuelRecordWhere({ station: "50%_off" }).station).toEqual({ $ilike: "%50\\%\\_off%" });
  });

  it("includes deleted records only when asked", () => {
    expect(fuelRecordWhere({ includeDeleted: true })).not.toHaveProperty("deletedAt");
  });
});

describe("in-memory fuel record date window", () => {
  it("keeps a record from the last day of a date-only range", async () => {
    const repo = new InMemoryFuelRecordRepository();
    await repo.save(record());

    const found = await repo.findAll({ tenantId: "tenant-a", to: "2026-09-24" });

    expect(found.map((r) => r.id)).toEqual(["f1"]);
  });
});
