import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "./contexts/fleet/vehicles/domain/repositories/vehicle.repository";
import { DISPATCH_JOBS_READER, type DispatchJobsReader } from "./contexts/fleet/dispatch/domain/ports/dispatch-jobs-reader.port";
import { FUEL_RECORD_REPOSITORY, type FuelRecordRepository } from "./contexts/fleet/fuel/domain/repositories/fuel-record.repository";
import { MAINTENANCE_RECORD_REPOSITORY, type MaintenanceRecordRepository } from "./maintenance-record.repository";
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

type ProfitTier = "excellent" | "good" | "marginal" | "loss_making";

// With no revenue the margin reads 0, so the sign of the profit decides first:
// a vehicle that only costs money is loss-making, not marginal.
export function profitTier(profit: number, margin: number): ProfitTier {
  if (profit < 0) return "loss_making";
  if (margin >= 30) return "excellent";
  if (margin >= 10) return "good";
  if (margin >= 0) return "marginal";
  return "loss_making";
}

function healthScore(revenue: number, totalCost: number, marginPercent: number): number {
  if (revenue <= 0) return totalCost > 0 ? 0 : 50;
  return Math.max(0, Math.min(100, Math.round(marginPercent + 50)));
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

  async getConfig(tenantId: string, vehicleId: string): Promise<FleetFinancialConfigRecord | null> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    return em.findOne(FleetFinancialConfigRecord, { tenantId, vehicleId });
  }

  async upsertConfig(tenantId: string, vehicleId: string, data: Record<string, unknown>) {
    const existing = await this.getConfig(tenantId, vehicleId);
    const cfg: FleetFinancialConfigRecord = {
      ...(existing ?? { id: randomUUID(), tenantId, vehicleId, createdAt: new Date() }),
      ...data,
      updatedAt: new Date(),
    } as FleetFinancialConfigRecord;
    await this.saveConfig(cfg);
    // Read back so the caller sees what was stored rather than what was sent.
    return (await this.getConfig(tenantId, vehicleId)) ?? cfg;
  }

  async listConfigs(tenantId: string, allowedVehicleIds?: AllowedVehicleIds) {
    const configs = await this.getConfigs(tenantId);
    return allowedVehicleIds ? configs.filter((c) => allowedVehicleIds.has(c.vehicleId)) : configs;
  }

  // Every figure is a per-vehicle row, so limiting the vehicles limits the
  // jobs, fuel, maintenance and configs counted against them too.
  private async vehiclesIn(tenantId: string, allowedVehicleIds: AllowedVehicleIds) {
    const vehicles = await this.vehicleRepo.findAll({ tenantId });
    return allowedVehicleIds ? vehicles.filter((v) => allowedVehicleIds.has(v.id)) : vehicles;
  }

  async computeProfitability(
    tenantId: string,
    periodMonths = 1,
    filters: ProfitabilityFilters = {},
    allowedVehicleIds?: AllowedVehicleIds,
  ) {
    const from = filters.from;
    const to = inclusiveEnd(filters.to);
    const now = new Date();
    const [vehicles, jobs, fuelRecords, maintRecords, configs] = await Promise.all([
      this.vehiclesIn(tenantId, allowedVehicleIds),
      this.dispatchJobs.listJobs(tenantId),
      this.fuelRepo.findAll({ tenantId, from, to }).then((rs) => rs.map((r) => r.toPrimitives())),
      this.maintRepo.findAllByTenant(tenantId),
      this.getConfigs(tenantId),
    ]);

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
      const tier = profitTier(profit, marginPercent);
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
        score: healthScore(revenue, totalCost, marginPercent),
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

    return rows.filter((v) => {
      if (filters.search && !v.plateNumber.toLowerCase().includes(filters.search.toLowerCase()) && !v.name.toLowerCase().includes(filters.search.toLowerCase())) return false;
      if (filters.marginFrom !== undefined && v.marginPercent < filters.marginFrom) return false;
      if (filters.marginTo !== undefined && v.marginPercent > filters.marginTo) return false;
      if (filters.revenueFrom !== undefined && v.revenue < filters.revenueFrom) return false;
      if (filters.revenueTo !== undefined && v.revenue > filters.revenueTo) return false;
      if (filters.netProfitFrom !== undefined && v.profit < filters.netProfitFrom) return false;
      if (filters.netProfitTo !== undefined && v.profit > filters.netProfitTo) return false;
      if (filters.scoreFrom !== undefined && v.score < filters.scoreFrom) return false;
      if (filters.scoreTo !== undefined && v.score > filters.scoreTo) return false;
      return true;
    });
  }

  private aggregate(pl: Awaited<ReturnType<FleetFinancialsUseCase["computeProfitability"]>>) {
    const totalRevenue = round2(pl.reduce((s, v) => s + v.revenue, 0));
    const totalCost = round2(pl.reduce((s, v) => s + v.totalCost, 0));
    const totalProfit = round2(totalRevenue - totalCost);
    const avgMargin = pl.length > 0 ? pl.reduce((s, v) => s + v.marginPercent, 0) / pl.length : 0;
    const avgScore = pl.length > 0 ? pl.reduce((s, v) => s + v.score, 0) / pl.length : 0;
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
    };
    return {
      totalRevenue,
      totalCost,
      totalProfit,
      avgMarginPercent: Math.round(avgMargin * 10) / 10,
      avgScore: Math.round(avgScore),
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
