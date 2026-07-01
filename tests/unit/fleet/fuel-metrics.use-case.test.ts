import { describe, expect, it } from "vitest";
import { FuelMetricsUseCase } from "../../../apps/fleet/src/contexts/fleet/fuel/application/fuel-metrics.use-case";
import { FuelThresholdService } from "../../../apps/fleet/src/contexts/fleet/fuel/application/fuel-threshold.service";
import { FuelRecord } from "../../../apps/fleet/src/contexts/fleet/fuel/domain/entities/fuel-record.entity";
import { InMemoryFuelRecordRepository } from "../../../apps/fleet/src/contexts/fleet/fuel/infrastructure/in-memory-fuel-record.repository";

const runtime = { generateId: () => "x", getDefaultTenantId: () => "t1" };

function makeRec(id: string, vehicleId: string, liters: number, odometer: number | null, recordedAt: string) {
  return FuelRecord.create({
    id, tenantId: "t1", vehicleId, driverId: null, vehicleType: "truck",
    liters, pricePerLiter: 2, station: null, odometer,
    recordedAt, recordedBy: "u1", deletedAt: null, auditTrail: [],
  });
}

async function buildUseCase(records: FuelRecord[]) {
  const repo = new InMemoryFuelRecordRepository();
  for (const r of records) await repo.save(r);
  const thresholds = new FuelThresholdService();
  return { uc: new FuelMetricsUseCase(repo, runtime as any, thresholds), thresholds };
}

describe("FuelMetricsUseCase", () => {
  it("groups consumption by month", async () => {
    const { uc } = await buildUseCase([
      makeRec("1", "v1", 40, null, "2026-01-15T00:00:00.000Z"),
      makeRec("2", "v1", 30, null, "2026-01-20T00:00:00.000Z"),
      makeRec("3", "v1", 50, null, "2026-02-05T00:00:00.000Z"),
    ]);
    const buckets = await uc.consumption("t1", "monthly");
    expect(buckets).toHaveLength(2);
    const jan = buckets.find((b) => b.label === "2026-01");
    expect(jan?.liters).toBe(70);
    expect(jan?.records).toBe(2);
  });

  it("groups consumption by week", async () => {
    const { uc } = await buildUseCase([
      makeRec("1", "v1", 40, null, "2026-01-05T00:00:00.000Z"),
      makeRec("2", "v1", 30, null, "2026-01-12T00:00:00.000Z"),
    ]);
    const buckets = await uc.consumption("t1", "weekly");
    expect(buckets).toHaveLength(2);
  });

  it("groups consumption by day", async () => {
    const { uc } = await buildUseCase([
      makeRec("1", "v1", 40, null, "2026-01-05T08:00:00.000Z"),
      makeRec("2", "v1", 30, null, "2026-01-05T18:00:00.000Z"),
      makeRec("3", "v1", 10, null, "2026-01-06T08:00:00.000Z"),
    ]);
    const buckets = await uc.consumption("t1", "daily");
    expect(buckets).toHaveLength(2);
    const jan5 = buckets.find((b) => b.label === "2026-01-05");
    expect(jan5?.liters).toBe(70);
  });

  it("filters consumption by date range", async () => {
    const { uc } = await buildUseCase([
      makeRec("1", "v1", 40, null, "2026-01-05T00:00:00.000Z"),
      makeRec("2", "v1", 30, null, "2026-01-20T00:00:00.000Z"),
    ]);
    const buckets = await uc.consumption("t1", "monthly", { from: "2026-01-10T00:00:00.000Z" });
    expect(buckets).toHaveLength(1);
    expect(buckets[0].liters).toBe(30);
  });

  it("returns empty when no records", async () => {
    const { uc } = await buildUseCase([]);
    expect(await uc.consumption("t1", "monthly")).toEqual([]);
  });

  it("computes vehicle efficiency from odometer deltas", async () => {
    const { uc } = await buildUseCase([
      makeRec("1", "v1", 10, 5000, "2026-01-01T00:00:00.000Z"),
      makeRec("2", "v1", 50, 5400, "2026-01-10T00:00:00.000Z"),
    ]);
    const result = await uc.efficiency("t1");
    expect(result[0].vehicleId).toBe("v1");
    expect(result[0].kmPerLiter).toBe(8); // 400km / 50L = 8
  });

  it("returns null kmPerLiter with only one odometer reading", async () => {
    const { uc } = await buildUseCase([makeRec("1", "v1", 50, 5000, "2026-01-01T00:00:00.000Z")]);
    const result = await uc.efficiency("t1");
    expect(result[0].kmPerLiter).toBeNull();
  });

  it("flags vehicle below threshold", async () => {
    const { uc, thresholds } = await buildUseCase([
      makeRec("1", "v1", 10, 5000, "2026-01-01T00:00:00.000Z"),
      makeRec("2", "v1", 50, 5400, "2026-01-10T00:00:00.000Z"),
    ]);
    thresholds.set("truck", 10);
    const result = await uc.efficiency("t1");
    expect(result[0].belowThreshold).toBe(true);
    expect(result[0].threshold).toBe(10);
  });

  it("does not flag vehicle above threshold", async () => {
    const { uc, thresholds } = await buildUseCase([
      makeRec("1", "v1", 10, 5000, "2026-01-01T00:00:00.000Z"),
      makeRec("2", "v1", 50, 5400, "2026-01-10T00:00:00.000Z"),
    ]);
    thresholds.set("truck", 5);
    const result = await uc.efficiency("t1");
    expect(result[0].belowThreshold).toBe(false);
  });

  it("splits consumption by fuel type", async () => {
    const diesel = FuelRecord.create({
      id: "d1", tenantId: "t1", vehicleId: "v1", driverId: null, vehicleType: "truck", fuelType: "diesel",
      liters: 40, pricePerLiter: 2, station: null, odometer: null,
      recordedAt: "2026-01-15T00:00:00.000Z", recordedBy: "u1", deletedAt: null, auditTrail: [],
    });
    const petrol = FuelRecord.create({
      id: "p1", tenantId: "t1", vehicleId: "v2", driverId: null, vehicleType: "van", fuelType: "petrol",
      liters: 25, pricePerLiter: 3, station: null, odometer: null,
      recordedAt: "2026-01-18T00:00:00.000Z", recordedBy: "u1", deletedAt: null, auditTrail: [],
    });
    const untyped = makeRec("u1", "v3", 10, null, "2026-01-20T00:00:00.000Z");
    const { uc } = await buildUseCase([diesel, petrol, untyped]);

    const [jan] = await uc.consumption("t1", "monthly");
    expect(jan.liters).toBe(75);
    expect(jan.byFuelType.diesel).toEqual({ liters: 40, totalCost: 80, records: 1 });
    expect(jan.byFuelType.petrol).toEqual({ liters: 25, totalCost: 75, records: 1 });
    expect(jan.byFuelType.unknown.liters).toBe(10);
  });
});
