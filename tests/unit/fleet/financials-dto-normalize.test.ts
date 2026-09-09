import { describe, expect, it } from "vitest";
import {
  normalizeFinancialConfig,
  normalizeStatementOptions,
} from "../../../apps/fleet/src/dto/financials.dto";

describe("financial config normalisation", () => {
  it("folds the form's field names onto the stored columns", () => {
    expect(
      normalizeFinancialConfig({
        fixedCostMonthly: 50000,
        driverWageMonthly: 120000,
        wageAllocationMethod: "per_trip",
        depreciationLifetimeMonths: 60,
        vehicleCostNgn: 9000000,
        salvageValueNgn: 500000,
      }),
    ).toEqual({
      monthlyOtherNgn: 50000,
      monthlyDriverWageNgn: 120000,
      driverWageAllocationMethod: "per_trip",
      assetUsefulLifeMonths: 60,
      assetPurchasePriceNgn: 9000000,
      assetSalvageValueNgn: 500000,
    });
  });

  it("lets the stored name win when both spellings arrive", () => {
    expect(normalizeFinancialConfig({ vehicleCostNgn: 1, assetPurchasePriceNgn: 2 })).toEqual({
      assetPurchasePriceNgn: 2,
    });
  });

  // An empty body must stay empty so the controller can refuse it rather than
  // writing a row of nulls the UI reads back as a configured vehicle.
  it("drops unset fields", () => {
    expect(normalizeFinancialConfig({ monthlyWagesNgn: undefined })).toEqual({});
  });
});

describe("statement option normalisation", () => {
  it("maps the deprecated toggle names", () => {
    const o = normalizeStatementOptions({
      includeFleetSummary: false,
      includePerVehicleBreakdown: false,
    });
    expect(o.includeSummary).toBe(false);
    expect(o.includeVehiclePL).toBe(false);
  });

  it("prefers the current names", () => {
    const o = normalizeStatementOptions({ includeSummary: true, includeFleetSummary: false });
    expect(o.includeSummary).toBe(true);
  });
});
