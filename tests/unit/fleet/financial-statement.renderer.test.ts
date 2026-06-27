import { describe, expect, it } from "vitest";
import {
  renderStatementCsv,
  renderStatementPdf,
  renderStatementXlsx,
  type FinancialStatement,
} from "../../../apps/fleet/src/financial-statement.renderer";

function sample(): FinancialStatement {
  return {
    generatedAt: "2026-06-27T00:00:00.000Z",
    periodMonths: 1,
    summary: { totalRevenue: 150000, totalCost: 90000, totalProfit: 60000, avgMarginPercent: 40, avgScore: 90, vehicleCount: 1 },
    vehicles: [
      {
        vehicleId: "v1", plateNumber: "ABC-123", revenue: 150000, fuelCost: 40000, maintenanceCost: 10000,
        fixedCosts: 40000, totalCost: 90000, profit: 60000, marginPercent: 40, tier: "excellent", score: 90,
        costBreakdown: { fuel: 40000, maintenance: 10000, wages: 20000, insurance: 10000, depreciation: 10000, other: 0 },
        jobCount: 3,
      },
    ],
  };
}

describe("financial statement renderers", () => {
  it("renders CSV with summary and vehicle rows", () => {
    const csv = renderStatementCsv(sample());
    expect(csv).toContain("Financial Statement,2026-06-27T00:00:00.000Z");
    expect(csv).toContain("Total Profit,60000");
    expect(csv).toContain("vehicleId,plateNumber,revenue");
    expect(csv).toContain("ABC-123");
  });

  it("renders a valid PDF document", () => {
    const pdf = renderStatementPdf(sample());
    const head = pdf.subarray(0, 8).toString("latin1");
    expect(head).toBe("%PDF-1.4");
    const body = pdf.toString("latin1");
    expect(body).toContain("%%EOF");
    expect(body).toContain("TruckMoov");
    expect(body).toContain("startxref");
  });

  it("renders an xlsx workbook", async () => {
    const xlsx = await renderStatementXlsx(sample());
    expect(xlsx.length).toBeGreaterThan(0);
    expect(xlsx.subarray(0, 2).toString("latin1")).toBe("PK");
  });
});
