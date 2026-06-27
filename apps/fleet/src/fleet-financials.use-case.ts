import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "./contexts/fleet/vehicles/domain/repositories/vehicle.repository";
import { DISPATCH_JOBS_READER, type DispatchJobsReader } from "./contexts/fleet/dispatch/domain/ports/dispatch-jobs-reader.port";
import { FUEL_RECORD_REPOSITORY, type FuelRecordRepository } from "./contexts/fleet/fuel/domain/repositories/fuel-record.repository";
import { MAINTENANCE_RECORD_REPOSITORY, type MaintenanceRecordRepository } from "./maintenance-record.repository";
import { getFleetOrm, FleetFinancialConfigRecord } from "./contexts/fleet/shared/infrastructure/persistence/fleet-orm";
import { AppConfigService } from "@shared/config";
import {
  renderStatementCsv,
  renderStatementPdf,
  renderStatementXlsx,
  type FinancialStatement,
  type StatementVehicle,
} from "./financial-statement.renderer";

export type StatementFormat = "pdf" | "csv" | "xlsx";

export type RenderedStatement = {
  body: Buffer | string;
  contentType: string;
  filename: string;
};

type ProfitTier = "excellent" | "good" | "marginal" | "loss_making";

function profitTier(margin: number): ProfitTier {
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
    await em.upsert(FleetFinancialConfigRecord, cfg);
  }

  async getConfig(tenantId: string, vehicleId: string): Promise<FleetFinancialConfigRecord | null> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    return em.findOne(FleetFinancialConfigRecord, { tenantId, vehicleId });
  }

  async upsertConfig(tenantId: string, vehicleId: string, data: Partial<Omit<FleetFinancialConfigRecord, "id" | "tenantId" | "vehicleId" | "createdAt" | "updatedAt">>) {
    const existing = await this.getConfig(tenantId, vehicleId);
    const cfg: FleetFinancialConfigRecord = {
      ...(existing ?? { id: randomUUID(), tenantId, vehicleId, createdAt: new Date() }),
      ...data,
      updatedAt: new Date(),
    } as FleetFinancialConfigRecord;
    await this.saveConfig(cfg);
    return cfg;
  }

  async listConfigs(tenantId: string) {
    return this.getConfigs(tenantId);
  }

  async computeProfitability(tenantId: string, periodMonths = 1) {
    const [vehicles, jobs, fuelRecords, maintRecords, configs] = await Promise.all([
      this.vehicleRepo.findAll({ tenantId }),
      this.dispatchJobs.listJobs(tenantId),
      this.fuelRepo.findAll({ tenantId }).then((rs) => rs.map((r) => r.toPrimitives())),
      this.maintRepo.findAllByTenant(tenantId),
      this.getConfigs(tenantId),
    ]);

    const configByVehicle = new Map(configs.map((c) => [c.vehicleId, c]));
    const completedJobs = jobs.filter((j) => j.status === "delivered");

    return vehicles.map((v) => {
      const vehicleJobs = completedJobs.filter((j) => j.assignedVehicleId === v.id);
      const revenue = vehicleJobs.reduce((sum, j) => sum + (j.amountNgn ?? 0), 0);
      const fuelCost = fuelRecords
        .filter((f) => f.vehicleId === v.id)
        .reduce((sum, f) => sum + (f.liters ?? 0) * (f.pricePerLiter ?? 0), 0);
      const maintCost = maintRecords
        .filter((r) => r.vehicleId === v.id && r.status === "completed")
        .reduce((sum, r) => sum + (r.cost ?? 0), 0);
      const cfg = configByVehicle.get(v.id);
      const wages = periodMonths * Number(cfg?.monthlyWagesNgn ?? 0);
      const insurance = periodMonths * Number(cfg?.monthlyInsuranceNgn ?? 0);
      const depreciation = periodMonths * Number(cfg?.monthlyDepreciationNgn ?? 0);
      const other = periodMonths * Number(cfg?.monthlyOtherNgn ?? 0);
      const fixedCosts = wages + insurance + depreciation + other;
      const totalCost = fuelCost + maintCost + fixedCosts;
      const profit = revenue - totalCost;
      const marginPercent = revenue > 0 ? (profit / revenue) * 100 : 0;
      return {
        vehicleId: v.id,
        plateNumber: v.plateNumber,
        revenue: round2(revenue),
        fuelCost: round2(fuelCost),
        maintenanceCost: round2(maintCost),
        fixedCosts: round2(fixedCosts),
        totalCost: round2(totalCost),
        profit: round2(profit),
        marginPercent: Math.round(marginPercent * 10) / 10,
        tier: profitTier(marginPercent),
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
      };
    });
  }

  private aggregate(pl: StatementVehicle[]) {
    const totalRevenue = round2(pl.reduce((s, v) => s + v.revenue, 0));
    const totalCost = round2(pl.reduce((s, v) => s + v.totalCost, 0));
    const totalProfit = round2(totalRevenue - totalCost);
    const avgMargin = pl.length > 0 ? pl.reduce((s, v) => s + v.marginPercent, 0) / pl.length : 0;
    const avgScore = pl.length > 0 ? pl.reduce((s, v) => s + v.score, 0) / pl.length : 0;
    return {
      totalRevenue,
      totalCost,
      totalProfit,
      avgMarginPercent: Math.round(avgMargin * 10) / 10,
      avgScore: Math.round(avgScore),
      vehicleCount: pl.length,
    };
  }

  async summary(tenantId: string) {
    return this.aggregate(await this.computeProfitability(tenantId));
  }

  async buildStatement(tenantId: string, periodMonths = 1): Promise<FinancialStatement> {
    const vehicles = await this.computeProfitability(tenantId, periodMonths);
    return {
      generatedAt: new Date().toISOString(),
      periodMonths,
      summary: this.aggregate(vehicles),
      vehicles,
    };
  }

  async exportStatement(tenantId: string, format: StatementFormat, periodMonths = 1): Promise<RenderedStatement> {
    const statement = await this.buildStatement(tenantId, periodMonths);
    switch (format) {
      case "csv":
        return { body: renderStatementCsv(statement), contentType: "text/csv", filename: "financial-statement.csv" };
      case "xlsx":
        return {
          body: await renderStatementXlsx(statement),
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          filename: "financial-statement.xlsx",
        };
      case "pdf":
      default:
        return { body: renderStatementPdf(statement), contentType: "application/pdf", filename: "financial-statement.pdf" };
    }
  }

  async exportVehiclePL(tenantId: string): Promise<string> {
    const pl = await this.computeProfitability(tenantId);
    const headers = ["vehicleId", "plateNumber", "revenue", "fuelCost", "maintenanceCost", "fixedCosts", "totalCost", "profit", "marginPercent", "tier", "jobCount"];
    return [
      headers.join(","),
      ...pl.map((v) => headers.map((h) => JSON.stringify((v as Record<string, unknown>)[h] ?? "")).join(",")),
    ].join("\n");
  }

  async exportCostBreakdown(tenantId: string): Promise<string> {
    const pl = await this.computeProfitability(tenantId);
    const headers = ["vehicleId", "plateNumber", "fuelCost", "maintenanceCost", "fixedCosts", "totalCost"];
    return [
      headers.join(","),
      ...pl.map((v) => headers.map((h) => JSON.stringify((v as Record<string, unknown>)[h] ?? "")).join(",")),
    ].join("\n");
  }
}
