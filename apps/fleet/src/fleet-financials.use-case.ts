import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "./contexts/fleet/vehicles/domain/repositories/vehicle.repository";
import { DISPATCH_JOBS_READER, type DispatchJobsReader } from "./contexts/fleet/dispatch/domain/ports/dispatch-jobs-reader.port";
import { FUEL_RECORD_REPOSITORY, type FuelRecordRepository } from "./contexts/fleet/fuel/domain/repositories/fuel-record.repository";
import { MAINTENANCE_RECORD_REPOSITORY, type MaintenanceRecordRepository } from "./maintenance-record.repository";
import { getFleetOrm, FleetFinancialConfigRecord } from "./contexts/fleet/shared/infrastructure/persistence/fleet-orm";
import { AppConfigService } from "@shared/config";

type ProfitTier = "excellent" | "good" | "marginal" | "loss_making";

function profitTier(margin: number): ProfitTier {
  if (margin >= 30) return "excellent";
  if (margin >= 10) return "good";
  if (margin >= 0) return "marginal";
  return "loss_making";
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
      // Real revenue from canonical dispatch jobs (was a flat ₦50k stub against the dead fleet_jobs table).
      const revenue = vehicleJobs.reduce((sum, j) => sum + (j.amountNgn ?? 0), 0);
      const fuelCost = fuelRecords
        .filter((f) => f.vehicleId === v.id)
        .reduce((sum, f) => sum + (f.liters ?? 0) * (f.pricePerLiter ?? 0), 0);
      const maintCost = maintRecords
        .filter((r) => r.vehicleId === v.id && r.status === "completed")
        .reduce((sum, r) => sum + (r.cost ?? 0), 0);
      const cfg = configByVehicle.get(v.id);
      const fixedCosts = periodMonths * (
        (cfg?.monthlyWagesNgn ?? 0) +
        (cfg?.monthlyInsuranceNgn ?? 0) +
        (cfg?.monthlyDepreciationNgn ?? 0) +
        (cfg?.monthlyOtherNgn ?? 0)
      );
      const totalCost = fuelCost + maintCost + fixedCosts;
      const profit = revenue - totalCost;
      const marginPercent = revenue > 0 ? (profit / revenue) * 100 : 0;
      return {
        vehicleId: v.id,
        plateNumber: v.plateNumber,
        revenue,
        fuelCost,
        maintenanceCost: maintCost,
        fixedCosts,
        totalCost,
        profit,
        marginPercent: Math.round(marginPercent * 10) / 10,
        tier: profitTier(marginPercent),
        jobCount: vehicleJobs.length,
      };
    });
  }

  async summary(tenantId: string) {
    const pl = await this.computeProfitability(tenantId);
    const totalRevenue = pl.reduce((s, v) => s + v.revenue, 0);
    const totalCost = pl.reduce((s, v) => s + v.totalCost, 0);
    const totalProfit = totalRevenue - totalCost;
    const avgMargin = pl.length > 0
      ? pl.reduce((s, v) => s + v.marginPercent, 0) / pl.length
      : 0;
    return { totalRevenue, totalCost, totalProfit, avgMarginPercent: Math.round(avgMargin * 10) / 10, vehicleCount: pl.length };
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
