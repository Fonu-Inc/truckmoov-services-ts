import { describe, expect, it } from "vitest";
import { FuelRecord } from "../../../apps/fleet/src/contexts/fleet/fuel/domain/entities/fuel-record.entity";
import { InMemoryFuelRecordRepository } from "../../../apps/fleet/src/contexts/fleet/fuel/infrastructure/in-memory-fuel-record.repository";

function makeRecord(id: string, overrides: Partial<Parameters<typeof FuelRecord.create>[0]> = {}) {
  return FuelRecord.create({
    id, tenantId: "t1", vehicleId: "v1", driverId: "d1", vehicleType: "truck",
    liters: 40, pricePerLiter: 1.5, station: "BP", odometer: 5000,
    recordedAt: `2026-03-0${id}-T08:00:00.000Z`, recordedBy: "u1",
    deletedAt: null, auditTrail: [], ...overrides,
  });
}

describe("InMemoryFuelRecordRepository", () => {
  it("saves and retrieves by id with tenant check", async () => {
    const repo = new InMemoryFuelRecordRepository();
    const r = makeRecord("1");
    await repo.save(r);
    expect(await repo.findById("1", "t1")).not.toBeNull();
    expect(await repo.findById("1", "other")).toBeNull();
  });

  it("filters deleted records by default", async () => {
    const repo = new InMemoryFuelRecordRepository();
    await repo.save(makeRecord("1"));
    await repo.save(makeRecord("2").softDelete("admin"));
    const all = await repo.findAll({ tenantId: "t1" });
    expect(all).toHaveLength(1);
    const withDeleted = await repo.findAll({ tenantId: "t1", includeDeleted: true });
    expect(withDeleted).toHaveLength(2);
  });

  it("filters by vehicleId", async () => {
    const repo = new InMemoryFuelRecordRepository();
    await repo.save(makeRecord("1", { vehicleId: "v1" }));
    await repo.save(makeRecord("2", { vehicleId: "v2" }));
    expect(await repo.findAll({ tenantId: "t1", vehicleId: "v1" })).toHaveLength(1);
  });

  it("filters by driverId", async () => {
    const repo = new InMemoryFuelRecordRepository();
    await repo.save(makeRecord("1", { driverId: "d1" }));
    await repo.save(makeRecord("2", { driverId: "d2" }));
    expect(await repo.findAll({ tenantId: "t1", driverId: "d2" })).toHaveLength(1);
  });

  it("filters by station substring (case insensitive)", async () => {
    const repo = new InMemoryFuelRecordRepository();
    await repo.save(makeRecord("1", { station: "Total Lagos" }));
    await repo.save(makeRecord("2", { station: "BP Abuja" }));
    expect(await repo.findAll({ tenantId: "t1", station: "total" })).toHaveLength(1);
  });

  it("filters by from/to date range", async () => {
    const repo = new InMemoryFuelRecordRepository();
    await repo.save(makeRecord("1", { recordedAt: "2026-01-01T00:00:00.000Z" }));
    await repo.save(makeRecord("2", { recordedAt: "2026-03-01T00:00:00.000Z" }));
    const result = await repo.findAll({ tenantId: "t1", from: "2026-02-01T00:00:00.000Z" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2");
  });

  it("returns records newest-first", async () => {
    const repo = new InMemoryFuelRecordRepository();
    await repo.save(makeRecord("1", { recordedAt: "2026-01-01T00:00:00.000Z" }));
    await repo.save(makeRecord("2", { recordedAt: "2026-03-01T00:00:00.000Z" }));
    const result = await repo.findAll({ tenantId: "t1" });
    expect(result[0].id).toBe("2");
  });

  it("tenant isolation in findAll", async () => {
    const repo = new InMemoryFuelRecordRepository();
    await repo.save(makeRecord("1", { tenantId: "t1" }));
    await repo.save(makeRecord("2", { tenantId: "t2" }));
    expect(await repo.findAll({ tenantId: "t1" })).toHaveLength(1);
  });
});
