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

  it("applies custom title, company name, and notes to CSV", () => {
    const csv = renderStatementCsv(sample(), { title: "Custom Statement", companyName: "Acme Logistics", notes: "internal use only" });
    expect(csv).toContain("Custom Statement,2026-06-27T00:00:00.000Z");
    expect(csv).toContain("Company,Acme Logistics");
    expect(csv).toContain("Notes,internal use only");
  });

  it("omits per-vehicle P&L when toggled off", () => {
    const csv = renderStatementCsv(sample(), { includeVehiclePL: false });
    expect(csv).not.toContain("Vehicle P&L");
    expect(csv).toContain("Total Profit,60000");
  });

  it("renders the cost breakdown as its own section", () => {
    const csv = renderStatementCsv(sample(), { includeVehiclePL: false });
    expect(csv).toContain("Cost Breakdown");
    expect(csv).toContain("vehicleId,plateNumber,fuel,maintenance,wages,insurance,depreciation,other,totalCost");
  });

  it("omits cover page and summary in PDF when toggled off", () => {
    const pdf = renderStatementPdf(sample(), { includeCoverPage: false, includeSummary: false });
    const body = pdf.toString("latin1");
    expect(body).not.toContain("TruckMoov");
    expect(body).toContain("Per-Vehicle P&L");
  });

  // A query DTO hands unset toggles over as explicit undefined. Spreading those
  // onto the defaults used to blank every section, which is how ?format=csv
  // came back as an empty file.
  it("keeps the defaults when every toggle arrives undefined", () => {
    const csv = renderStatementCsv(sample(), {
      includeCoverPage: undefined,
      includeSummary: undefined,
      includeVehiclePL: undefined,
      includeCostBreakdown: undefined,
    });
    expect(csv.length).toBeGreaterThan(0);
    expect(csv).toContain("Total Profit,60000");
    expect(csv).toContain("Vehicle P&L");
  });
});
