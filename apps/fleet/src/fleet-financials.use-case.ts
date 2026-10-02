import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "./contexts/fleet/vehicles/domain/repositories/vehicle.repository";
import { VehicleNotFoundError } from "./contexts/fleet/vehicles";
import { DISPATCH_JOBS_READER, type DispatchJob, type DispatchJobsReader } from "./contexts/fleet/dispatch/domain/ports/dispatch-jobs-reader.port";
import type { Vehicle } from "./contexts/fleet/vehicles/domain/entities/vehicle.entity";
import type { FuelRecordProps } from "./contexts/fleet/fuel/domain/entities/fuel-record.entity";
import { monthsInWindow, trailingMonthWindows, type AnalyticsRange } from "./contexts/fleet/reports/domain/analytics-range";
import { FUEL_RECORD_REPOSITORY, type FuelRecordRepository } from "./contexts/fleet/fuel/domain/repositories/fuel-record.repository";
import { MAINTENANCE_RECORD_REPOSITORY, type MaintenanceRecordRepository, type StoredMaintenanceRecord } from "./maintenance-record.repository";
import { getFleetOrm, FleetFinancialConfigRecord } from "./contexts/fleet/shared/infrastructure/persistence/fleet-orm";
import { AppConfigService } from "@shared/config";
import { monthlyDepreciation, monthlyWages } from "./financial-costs";
import { inclusiveEnd } from "./utils/date-window";
import {
  renderCostBreakdownCsv,
  renderVehiclePLCsv,
  renderStatementCsv,
  renderStatementPdf,
  renderStatementXlsx,
  type FinancialStatement,
  type StatementOptions,
} from "./financial-statement.renderer";

export type StatementFormat = "pdf" | "csv" | "xlsx";

export type RenderedStatement = {
  body: Buffer | string;
  contentType: string;
  filename: string;
};

type ScoredTier = "excellent" | "good" | "marginal" | "loss_making";
type ProfitTier = ScoredTier | "unscored";

// With no revenue the margin reads 0, so the sign of the profit decides first:
// a vehicle that only costs money is loss-making, not marginal.
export function profitTier(profit: number, margin: number): ScoredTier {
  if (profit < 0) return "loss_making";
  if (margin >= 30) return "excellent";
  if (margin >= 10) return "good";
  if (margin >= 0) return "marginal";
  return "loss_making";
}

function healthScore(revenue: number, marginPercent: number): number {
  if (revenue <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(marginPercent + 50)));
}

// A vehicle that earned and cost nothing in the period has no figures to judge,
// so it is unscored rather than a middling "marginal" 50.
export function scoreVehicle(
  revenue: number,
  totalCost: number,
  marginPercent: number,
): { tier: ProfitTier; score: number | null } {
  if (revenue === 0 && totalCost === 0) return { tier: "unscored", score: null };
  return { tier: profitTier(revenue - totalCost, marginPercent), score: healthScore(revenue, marginPercent) };
}

function scoreInRange(score: number | null, from?: number, to?: number): boolean {
  if (from === undefined && to === undefined) return true;
  if (score === null) return false;
  return (from === undefined || score >= from) && (to === undefined || score <= to);
}

function average(values: number[]): number | null {
  return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function inRange(iso: string | null | undefined, from?: string, to?: string): boolean {
  if (!iso) return !from && !to;
  if (from && iso < from) return false;
  if (to && iso > to) return false;
  return true;
}

/** Null or absent means the whole tenant; a set limits every figure to those vehicles. */
export type AllowedVehicleIds = ReadonlySet<string> | null | undefined;

type ProfitInputs = {
  vehicles: Vehicle[];
  jobs: DispatchJob[];
  fuelRecords: FuelRecordProps[];
  maintRecords: StoredMaintenanceRecord[];
  configs: FleetFinancialConfigRecord[];
};

type ProfitRow = ReturnType<FleetFinancialsUseCase["buildProfitRows"]>[number];

const PROFIT_LOSS_TREND_MONTHS = 6;

function profitLossFigures(rows: ProfitRow[]) {
  const sum = (pick: (row: ProfitRow) => number) => round2(rows.reduce((total, row) => total + pick(row), 0));
  const revenue = sum((r) => r.revenue);
  const costs = {
    fuel: sum((r) => r.costBreakdown.fuel),
    maintenance: sum((r) => r.costBreakdown.maintenance),
    wages: sum((r) => r.costBreakdown.wages),
    insurance: sum((r) => r.costBreakdown.insurance),
    depreciation: sum((r) => r.costBreakdown.depreciation),
    other: sum((r) => r.costBreakdown.other),
  };
  const totalCosts = round2(Object.values(costs).reduce((total, value) => total + value, 0));
  const netProfit = round2(revenue - totalCosts);
  return {
    revenue,
    costs,
    totalCosts,
    netProfit,
    marginPercent: revenue > 0 ? Math.round((netProfit / revenue) * 1000) / 10 : 0,
    deliveredJobs: rows.reduce((total, row) => total + row.jobCount, 0),
  };
}

export type ProfitabilityFilters = {
  from?: string;
  to?: string;
  search?: string;
  marginFrom?: number;
  marginTo?: number;
  revenueFrom?: number;
  revenueTo?: number;
  netProfitFrom?: number;
  netProfitTo?: number;
  scoreFrom?: number;
  scoreTo?: number;
};

@Injectable()
export class FleetFinancialsUseCase {
  constructor(
    @Inject(VEHICLE_REPOSITORY) private readonly vehicleRepo: VehicleRepository,
    @Inject(DISPATCH_JOBS_READER) private readonly dispatchJobs: DispatchJobsReader,
    @Inject(FUEL_RECORD_REPOSITORY) private readonly fuelRepo: FuelRecordRepository,
    @Inject(MAINTENANCE_RECORD_REPOSITORY) private readonly maintRepo: MaintenanceRecordRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  private async getConfigs(tenantId: string): Promise<FleetFinancialConfigRecord[]> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    return em.find(FleetFinancialConfigRecord, { tenantId });
  }

  private async saveConfig(cfg: FleetFinancialConfigRecord): Promise<void> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    // The row is unique on (tenantId, vehicleId), not on the generated id, so
    // conflicting on the id would insert a second row for the same vehicle.
    await em.upsert(FleetFinancialConfigRecord, cfg, { onConflictFields: ["tenantId", "vehicleId"] });
    await em.flush();
  }

  private async findConfig(tenantId: string, vehicleId: string): Promise<FleetFinancialConfigRecord | null> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    return em.findOne(FleetFinancialConfigRecord, { tenantId, vehicleId });
  }

  private async assertVehicleExists(tenantId: string, vehicleId: string): Promise<void> {
    if (!(await this.vehicleRepo.findById(vehicleId, tenantId))) throw new VehicleNotFoundError(vehicleId);
  }

  async getConfig(tenantId: string, vehicleId: string): Promise<FleetFinancialConfigRecord | null> {
    await this.assertVehicleExists(tenantId, vehicleId);
    return this.findConfig(tenantId, vehicleId);
  }

  async upsertConfig(tenantId: string, vehicleId: string, data: Record<string, unknown>) {
    await this.assertVehicleExists(tenantId, vehicleId);
    const existing = await this.findConfig(tenantId, vehicleId);
    const cfg: FleetFinancialConfigRecord = {
      ...(existing ?? { id: randomUUID(), tenantId, vehicleId, createdAt: new Date() }),
      ...data,
      updatedAt: new Date(),
    } as FleetFinancialConfigRecord;
    await this.saveConfig(cfg);
    // Read back so the caller sees what was stored rather than what was sent.
    return (await this.findConfig(tenantId, vehicleId)) ?? cfg;
  }

  // Only configs whose vehicle still exists: rows left by vehicles deleted
  // before deletion took the config with it would otherwise still list.
  async listConfigs(tenantId: string, allowedVehicleIds?: AllowedVehicleIds) {
    const [configs, vehicles] = await Promise.all([this.getConfigs(tenantId), this.vehiclesIn(tenantId, allowedVehicleIds)]);
    const known = new Set(vehicles.map((v) => v.id));
    return configs.filter((c) => known.has(c.vehicleId));
  }

  // Every figure is a per-vehicle row, so limiting the vehicles limits the
  // jobs, fuel, maintenance and configs counted against them too.
  private async vehiclesIn(tenantId: string, allowedVehicleIds: AllowedVehicleIds) {
    const vehicles = await this.vehicleRepo.findAll({ tenantId });
    return allowedVehicleIds ? vehicles.filter((v) => allowedVehicleIds.has(v.id)) : vehicles;
  }

  buildProfitRows(inputs: ProfitInputs, window: { from?: string; to?: string }, periodMonths: number) {
    const { from, to } = window;
    const now = new Date();
    const { vehicles, jobs, maintRecords, configs } = inputs;
    const fuelRecords = inputs.fuelRecords.filter((f) => inRange(f.recordedAt, from, to));
    const configByVehicle = new Map(configs.map((c) => [c.vehicleId, c]));
    const completedJobs = jobs.filter((j) => j.status === "delivered" && inRange(j.updatedAt, from, to));
    const completedMaint = maintRecords.filter((r) => r.status === "completed" && inRange(r.completedDate, from, to));

    const rows = vehicles.map((v) => {
      const vehicleJobs = completedJobs.filter((j) => j.assignedVehicleId === v.id);
      const revenue = vehicleJobs.reduce((sum, j) => sum + (j.amountNgn ?? 0), 0);
      const vehicleFuelRecords = fuelRecords.filter((f) => f.vehicleId === v.id);
      const actualFuelCost = vehicleFuelRecords.reduce((sum, f) => sum + (f.liters ?? 0) * (f.pricePerLiter ?? 0), 0);
      const vehicleMaintRecords = completedMaint.filter((r) => r.vehicleId === v.id);
      const actualMaintCost = vehicleMaintRecords.reduce((sum, r) => sum + (r.cost ?? 0), 0);

      const cfg = configByVehicle.get(v.id);
      const fuelCost =
        vehicleFuelRecords.length > 0 ? actualFuelCost : periodMonths * (cfg?.fuelEstimateNgnPerMonth ?? 0);
      const maintCost =
        vehicleMaintRecords.length > 0
          ? actualMaintCost
          : periodMonths * (cfg?.maintenanceEstimateNgnPerMonth ?? 0);

      const wages = periodMonths * monthlyWages(cfg);
      const insurance = periodMonths * (cfg?.monthlyInsuranceNgn ?? 0);
      const depreciation = periodMonths * monthlyDepreciation(cfg, now);
      const parking = periodMonths * (cfg?.monthlyParkingNgn ?? 0);
      const other = periodMonths * (cfg?.monthlyOtherNgn ?? 0);
      const fixedCosts = wages + insurance + depreciation + parking + other;
      const totalCost = fuelCost + maintCost + fixedCosts;
      const profit = revenue - totalCost;
      const marginPercent = revenue > 0 ? (profit / revenue) * 100 : 0;
      const { tier, score } = scoreVehicle(revenue, totalCost, marginPercent);
      const sortedOdo = vehicleFuelRecords
        .filter((f) => f.odometer !== null && f.odometer !== undefined)
        .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
      const kmDriven =
        sortedOdo.length >= 2 ? round2(sortedOdo[sortedOdo.length - 1].odometer! - sortedOdo[0].odometer!) : 0;

      return {
        vehicleId: v.id,
        plateNumber: v.plateNumber,
        name: [v.make, v.model].filter(Boolean).join(" ").trim() || v.plateNumber,
        revenue: round2(revenue),
        fuelCost: round2(fuelCost),
        maintenanceCost: round2(maintCost),
        fixedCosts: round2(fixedCosts),
        totalCost: round2(totalCost),
        profit: round2(profit),
        marginPercent: Math.round(marginPercent * 10) / 10,
        tier,
        status: tier,
        score,
        costBreakdown: {
          fuel: round2(fuelCost),
          maintenance: round2(maintCost),
          wages: round2(wages),
          insurance: round2(insurance),
          depreciation: round2(depreciation),
          other: round2(other),
        },
        jobCount: vehicleJobs.length,
        kmDriven,
      };
    });

    return rows;
  }

  private async loadProfitInputs(
    tenantId: string,
    window: { from?: string; to?: string },
    allowedVehicleIds?: AllowedVehicleIds,
  ): Promise<ProfitInputs> {
    const [vehicles, jobs, fuelRecords, maintRecords, configs] = await Promise.all([
      this.vehiclesIn(tenantId, allowedVehicleIds),
      this.dispatchJobs.listJobs(tenantId),
      this.fuelRepo.findAll({ tenantId, from: window.from, to: window.to }).then((rs) => rs.map((r) => r.toPrimitives())),
      this.maintRepo.findAllByTenant(tenantId),
      this.getConfigs(tenantId),
    ]);
    return { vehicles, jobs, fuelRecords, maintRecords, configs };
  }

  async computeProfitability(
    tenantId: string,
    periodMonths = 1,
    filters: ProfitabilityFilters = {},
    allowedVehicleIds?: AllowedVehicleIds,
  ) {
    const to = inclusiveEnd(filters.to);
    const inputs = await this.loadProfitInputs(tenantId, { from: filters.from, to }, allowedVehicleIds);
    const rows = this.buildProfitRows(inputs, { from: filters.from, to }, periodMonths);
    return rows.filter((v) => {
      if (filters.search && !v.plateNumber.toLowerCase().includes(filters.search.toLowerCase()) && !v.name.toLowerCase().includes(filters.search.toLowerCase())) return false;
      if (filters.marginFrom !== undefined && v.marginPercent < filters.marginFrom) return false;
      if (filters.marginTo !== undefined && v.marginPercent > filters.marginTo) return false;
      if (filters.revenueFrom !== undefined && v.revenue < filters.revenueFrom) return false;
      if (filters.revenueTo !== undefined && v.revenue > filters.revenueTo) return false;
      if (filters.netProfitFrom !== undefined && v.profit < filters.netProfitFrom) return false;
      if (filters.netProfitTo !== undefined && v.profit > filters.netProfitTo) return false;
      return scoreInRange(v.score, filters.scoreFrom, filters.scoreTo);
    });
  }

  /**
   * Revenue is delivered jobs, costs are recorded fuel and completed
   * maintenance plus the fixed costs set in each vehicle's configuration,
   * counted for the share of each month the window covers. One load serves the
   * whole window and the monthly trend.
   */
  async profitLoss(tenantId: string, range: AnalyticsRange, allowedVehicleIds?: AllowedVehicleIds) {
    const trend = trailingMonthWindows(range.to, PROFIT_LOSS_TREND_MONTHS);
    const earliest = trend[0].from < range.from ? trend[0].from : range.from;
    const inputs = await this.loadProfitInputs(tenantId, { from: earliest, to: range.to }, allowedVehicleIds);
    const figuresFor = (window: { from: string; to: string }) =>
      profitLossFigures(this.buildProfitRows(inputs, window, monthsInWindow(window.from, window.to)));
    return {
      from: range.from,
      to: range.to,
      summary: figuresFor(range),
      monthly: trend.map((window) => {
        const figures = figuresFor(window);
        return {
          month: window.month,
          revenue: figures.revenue,
          costs: figures.totalCosts,
          profit: figures.netProfit,
          marginPercent: figures.marginPercent,
        };
      }),
    };
  }

  private aggregate(pl: Awaited<ReturnType<FleetFinancialsUseCase["computeProfitability"]>>) {
    const totalRevenue = round2(pl.reduce((s, v) => s + v.revenue, 0));
    const totalCost = round2(pl.reduce((s, v) => s + v.totalCost, 0));
    const totalProfit = round2(totalRevenue - totalCost);
    const avgMargin = pl.length > 0 ? pl.reduce((s, v) => s + v.marginPercent, 0) / pl.length : 0;
    const avgScore = average(pl.flatMap((v) => (v.score === null ? [] : [v.score])));
    const costBreakdown = {
      fuel: round2(pl.reduce((s, v) => s + v.costBreakdown.fuel, 0)),
      maintenance: round2(pl.reduce((s, v) => s + v.costBreakdown.maintenance, 0)),
      wages: round2(pl.reduce((s, v) => s + v.costBreakdown.wages, 0)),
      insurance: round2(pl.reduce((s, v) => s + v.costBreakdown.insurance, 0)),
      depreciation: round2(pl.reduce((s, v) => s + v.costBreakdown.depreciation, 0)),
      other: round2(pl.reduce((s, v) => s + v.costBreakdown.other, 0)),
    };
    const tierDistribution = {
      excellent: pl.filter((v) => v.tier === "excellent").length,
      good: pl.filter((v) => v.tier === "good").length,
      marginal: pl.filter((v) => v.tier === "marginal").length,
      loss_making: pl.filter((v) => v.tier === "loss_making").length,
      unscored: pl.filter((v) => v.tier === "unscored").length,
    };
    return {
      totalRevenue,
      totalCost,
      totalProfit,
      avgMarginPercent: Math.round(avgMargin * 10) / 10,
      avgScore: avgScore === null ? null : Math.round(avgScore),
      vehicleCount: pl.length,
      costBreakdown,
      tierDistribution,
    };
  }

  async summary(tenantId: string, filters: ProfitabilityFilters = {}, allowedVehicleIds?: AllowedVehicleIds) {
    return this.aggregate(await this.computeProfitability(tenantId, 1, filters, allowedVehicleIds));
  }

  async buildStatement(
    tenantId: string,
    periodMonths = 1,
    allowedVehicleIds?: AllowedVehicleIds,
  ): Promise<FinancialStatement> {
    const vehicles = await this.computeProfitability(tenantId, periodMonths, {}, allowedVehicleIds);
    return {
      generatedAt: new Date().toISOString(),
      periodMonths,
      summary: this.aggregate(vehicles),
      vehicles,
    };
  }

  async exportStatement(
    tenantId: string,
    format: StatementFormat,
    periodMonths = 1,
    options: StatementOptions = {},
    allowedVehicleIds?: AllowedVehicleIds,
  ): Promise<RenderedStatement> {
    const statement = await this.buildStatement(tenantId, periodMonths, allowedVehicleIds);
    switch (format) {
      case "csv":
        return { body: renderStatementCsv(statement, options), contentType: "text/csv", filename: "financial-statement.csv" };
      case "xlsx":
        return {
          body: await renderStatementXlsx(statement, options),
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          filename: "financial-statement.xlsx",
        };
      case "pdf":
      default:
        return {
          body: renderStatementPdf(statement, options),
          contentType: "application/pdf",
          filename: "financial-statement.pdf",
        };
    }
  }

  async exportVehiclePL(tenantId: string, allowedVehicleIds?: AllowedVehicleIds): Promise<string> {
    return renderVehiclePLCsv(await this.computeProfitability(tenantId, 1, {}, allowedVehicleIds));
  }

  async exportCostBreakdown(tenantId: string, allowedVehicleIds?: AllowedVehicleIds): Promise<string> {
    return renderCostBreakdownCsv(await this.computeProfitability(tenantId, 1, {}, allowedVehicleIds));
  }
}
