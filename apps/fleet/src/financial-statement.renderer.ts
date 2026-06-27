import { Workbook } from "exceljs";
import { SimplePdf, type PdfCell } from "./utils/pdf";

export type StatementCostBreakdown = {
  fuel: number;
  maintenance: number;
  wages: number;
  insurance: number;
  depreciation: number;
  other: number;
};

export type StatementVehicle = {
  vehicleId: string;
  plateNumber: string;
  revenue: number;
  fuelCost: number;
  maintenanceCost: number;
  fixedCosts: number;
  totalCost: number;
  profit: number;
  marginPercent: number;
  tier: string;
  score: number;
  costBreakdown: StatementCostBreakdown;
  jobCount: number;
};

export type FinancialStatementSummary = {
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  avgMarginPercent: number;
  avgScore: number;
  vehicleCount: number;
};

export type FinancialStatement = {
  generatedAt: string;
  periodMonths: number;
  summary: FinancialStatementSummary;
  vehicles: StatementVehicle[];
};

const VEHICLE_HEADERS = [
  "vehicleId", "plateNumber", "revenue", "fuel", "maintenance", "wages",
  "insurance", "depreciation", "other", "totalCost", "profit", "marginPercent", "score", "tier", "jobCount",
];

function vehicleRow(v: StatementVehicle): (string | number)[] {
  return [
    v.vehicleId, v.plateNumber, v.revenue, v.costBreakdown.fuel, v.costBreakdown.maintenance,
    v.costBreakdown.wages, v.costBreakdown.insurance, v.costBreakdown.depreciation, v.costBreakdown.other,
    v.totalCost, v.profit, v.marginPercent, v.score, v.tier, v.jobCount,
  ];
}

function csvCell(value: string | number): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function renderStatementCsv(s: FinancialStatement): string {
  return [
    `Financial Statement,${s.generatedAt}`,
    `Period (months),${s.periodMonths}`,
    `Total Revenue,${s.summary.totalRevenue}`,
    `Total Cost,${s.summary.totalCost}`,
    `Total Profit,${s.summary.totalProfit}`,
    `Avg Margin %,${s.summary.avgMarginPercent}`,
    `Avg Score,${s.summary.avgScore}`,
    `Vehicles,${s.summary.vehicleCount}`,
    "",
    VEHICLE_HEADERS.join(","),
    ...s.vehicles.map((v) => vehicleRow(v).map(csvCell).join(",")),
  ].join("\n");
}

export async function renderStatementXlsx(s: FinancialStatement): Promise<Buffer> {
  const wb = new Workbook();
  wb.creator = "TruckMoov";

  const summary = wb.addWorksheet("Summary");
  summary.addRows([
    ["Financial Statement", s.generatedAt],
    ["Period (months)", s.periodMonths],
    ["Total Revenue", s.summary.totalRevenue],
    ["Total Cost", s.summary.totalCost],
    ["Total Profit", s.summary.totalProfit],
    ["Avg Margin %", s.summary.avgMarginPercent],
    ["Avg Score", s.summary.avgScore],
    ["Vehicles", s.summary.vehicleCount],
  ]);
  summary.getColumn(1).font = { bold: true };

  const sheet = wb.addWorksheet("Vehicles");
  sheet.addRow(VEHICLE_HEADERS);
  sheet.getRow(1).font = { bold: true };
  for (const v of s.vehicles) sheet.addRow(vehicleRow(v));

  return Buffer.from(await wb.xlsx.writeBuffer());
}

function money(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function renderStatementPdf(s: FinancialStatement): Buffer {
  const pdf = new SimplePdf();
  pdf.heading("TruckMoov — Financial Statement", 18);
  pdf.text(`Generated: ${s.generatedAt}`, 9);
  pdf.text(`Period: ${s.periodMonths} month(s)`, 9);
  pdf.spacer();

  pdf.heading("Summary", 13);
  const summaryRow = (label: string, value: string): PdfCell[] => [
    { text: label, width: 220 },
    { text: value, width: 160, align: "right" },
  ];
  pdf.row(summaryRow("Total Revenue (NGN)", money(s.summary.totalRevenue)));
  pdf.row(summaryRow("Total Cost (NGN)", money(s.summary.totalCost)));
  pdf.row(summaryRow("Total Profit (NGN)", money(s.summary.totalProfit)));
  pdf.row(summaryRow("Average Margin %", `${s.summary.avgMarginPercent}`));
  pdf.row(summaryRow("Average Score", `${s.summary.avgScore}/100`));
  pdf.row(summaryRow("Vehicles", `${s.summary.vehicleCount}`));
  pdf.spacer();

  pdf.heading("Per-Vehicle P&L", 13);
  const header: PdfCell[] = [
    { text: "Vehicle", width: 110 },
    { text: "Revenue", width: 90, align: "right" },
    { text: "Cost", width: 90, align: "right" },
    { text: "Profit", width: 90, align: "right" },
    { text: "Margin%", width: 65, align: "right" },
    { text: "Score", width: 55, align: "right" },
  ];
  pdf.row(header, { bold: true });
  for (const v of s.vehicles) {
    pdf.row([
      { text: v.plateNumber || v.vehicleId, width: 110 },
      { text: money(v.revenue), width: 90, align: "right" },
      { text: money(v.totalCost), width: 90, align: "right" },
      { text: money(v.profit), width: 90, align: "right" },
      { text: `${v.marginPercent}`, width: 65, align: "right" },
      { text: `${v.score}`, width: 55, align: "right" },
    ]);
  }

  return pdf.toBuffer();
}
