import { describe, expect, it, vi } from "vitest";
import { FleetFinancialsUseCase, profitTier } from "../../../apps/fleet/src/fleet-financials.use-case";
import { monthlyDepreciation, monthlyWages } from "../../../apps/fleet/src/financial-costs";
import { FuelRecord } from "../../../apps/fleet/src/contexts/fleet/fuel/domain/entities/fuel-record.entity";

const NOW = new Date("2026-09-24T10:00:00.000Z");

function useCaseWith(
  opts: { configs?: Record<string, unknown>[]; jobs?: unknown[]; fuel?: FuelRecord[]; maint?: unknown[] } = {},
) {
  const vehicles = [{ id: "v1", plateNumber: "ABC-123", make: "Volvo", model: "FH" }];
  const useCase = new FleetFinancialsUseCase(
    { findAll: async () => vehicles } as never,
    { listJobs: async () => opts.jobs ?? [] } as never,
    { findAll: vi.fn(async () => opts.fuel ?? []) } as never,
    { findAllByTenant: async () => opts.maint ?? [] } as never,
    {} as never,
  );
  vi.spyOn(useCase as unknown as { getConfigs: () => Promise<unknown[]> }, "getConfigs").mockResolvedValue(
    (opts.configs ?? []).map((cfg) => ({ vehicleId: "v1", ...cfg })),
  );
  return useCase;
}

function fuel(recordedAt: string): FuelRecord {
  return FuelRecord.create({
    id: `f-${recordedAt}`,
    tenantId: "tenant-a",
    vehicleId: "v1",
    driverId: null,
    vehicleType: null,
    liters: 8,
    pricePerLiter: 1000,
    station: null,
    odometer: null,
    recordedAt,
    recordedBy: "u1",
    deletedAt: null,
    auditTrail: [],
  });
}

describe("profit tier", () => {
  it("calls a vehicle with a loss loss-making even when revenue is 0", () => {
    expect(profitTier(-105000, 0)).toBe("loss_making");
  });

  it("keeps the margin bands for a profit", () => {
    expect(profitTier(100, 35)).toBe("excellent");
    expect(profitTier(100, 15)).toBe("good");
    expect(profitTier(0, 0)).toBe("marginal");
  });

  it("counts a pure-cost vehicle as loss_making in the summary", async () => {
    const useCase = useCaseWith({ configs: [{ monthlyInsuranceNgn: 105000 }] });

    const summary = await useCase.summary("tenant-a");

    expect(summary.tierDistribution).toEqual({ excellent: 0, good: 0, marginal: 0, loss_making: 1 });
  });
});

describe("costs from the Configure Costs form", () => {
  it("uses the driver wage when the legacy wage field is empty", () => {
    expect(monthlyWages({ monthlyWagesNgn: null, monthlyDriverWageNgn: 90000 })).toBe(90000);
    expect(monthlyWages({ monthlyWagesNgn: 50000, monthlyDriverWageNgn: 90000 })).toBe(50000);
    expect(monthlyWages(null)).toBe(0);
  });

  it("derives straight-line depreciation from the asset fields", () => {
    const cfg = {
      monthlyDepreciationNgn: null,
      assetPurchasePriceNgn: 12_000_000,
      assetSalvageValueNgn: 2_400_000,
      assetUsefulLifeMonths: 60,
      assetPurchaseDate: "2025-09-01",
      depreciationMethod: "straight_line",
    };

    expect(monthlyDepreciation(cfg, NOW)).toBe(160000);
    expect(monthlyDepreciation({ ...cfg, assetPurchaseDate: "2020-01-01" }, NOW)).toBe(0);
  });

  it("derives declining-balance depreciation from the remaining book value", () => {
    const cfg = {
      assetPurchasePriceNgn: 12_000_000,
      assetSalvageValueNgn: 0,
      assetUsefulLifeMonths: 60,
      assetPurchaseDate: "2026-09-01",
      depreciationMethod: "declining_balance",
    };

    expect(monthlyDepreciation(cfg, NOW)).toBe(400000);
  });

  it("keeps a set monthly depreciation over the asset fields", () => {
    expect(monthlyDepreciation({ monthlyDepreciationNgn: 5000, assetPurchasePriceNgn: 1_000_000, assetUsefulLifeMonths: 10 }, NOW)).toBe(5000);
  });

  it("feeds both into the vehicle's fixed costs", async () => {
    const useCase = useCaseWith({
      configs: [{ monthlyDriverWageNgn: 90000, assetPurchasePriceNgn: 600000, assetUsefulLifeMonths: 60 }],
    });

    const [row] = await useCase.computeProfitability("tenant-a");

    expect(row.costBreakdown.wages).toBe(90000);
    expect(row.costBreakdown.depreciation).toBe(10000);
    expect(row.fixedCosts).toBe(100000);
  });

  it("adds completed maintenance cost to the fixed costs as a number", async () => {
    const maint = [
      { vehicleId: "v1", status: "completed", completedDate: "2026-09-10", cost: 150 },
      { vehicleId: "v1", status: "completed", completedDate: "2026-09-12", cost: 50 },
    ];
    const useCase = useCaseWith({ configs: [{ monthlyInsuranceNgn: 105000 }], maint });

    const [row] = await useCase.computeProfitability("tenant-a");

    expect(row.costBreakdown.maintenance).toBe(200);
    expect(row.totalCost).toBe(105200);
    expect(row.profit).toBe(-105200);
  });
});

describe("profitability date window", () => {
  it("counts fuel bought on the last day of a date-only range", async () => {
    const useCase = useCaseWith({ fuel: [fuel("2026-09-24T10:00:00.000Z")] });
    const fuelRepo = (useCase as unknown as { fuelRepo: { findAll: ReturnType<typeof vi.fn> } }).fuelRepo;

    await useCase.computeProfitability("tenant-a", 1, { from: "2026-09-01", to: "2026-09-24" });

    expect(fuelRepo.findAll).toHaveBeenCalledWith({ tenantId: "tenant-a", from: "2026-09-01", to: "2026-09-24T23:59:59.999Z" });
  });
});

describe("standalone financial exports", () => {
  it("uses the statement's Vehicle P&L columns", async () => {
    const csv = await useCaseWith({ configs: [{ monthlyInsuranceNgn: 105000 }] }).exportVehiclePL("tenant-a");

    expect(csv.split("\n")).toEqual([
      "vehicleId,plateNumber,revenue,totalCost,profit,marginPercent,score,tier,jobCount",
      "v1,ABC-123,0,105000,-105000,0,0,loss_making,0",
    ]);
  });

  it("uses the statement's Cost Breakdown columns", async () => {
    const csv = await useCaseWith({ configs: [{ monthlyInsuranceNgn: 105000 }] }).exportCostBreakdown("tenant-a");

    expect(csv.split("\n")).toEqual([
      "vehicleId,plateNumber,fuel,maintenance,wages,insurance,depreciation,other,totalCost",
      "v1,ABC-123,0,0,0,105000,0,0,105000",
    ]);
  });
});
