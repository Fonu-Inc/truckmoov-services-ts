import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { AppConfigService } from "@shared/config";
import { FUEL_RECORD_REPOSITORY, type FuelRecordRepository } from "../domain/repositories/fuel-record.repository";
import { getFleetOrm, FleetFuelBudgetRecord } from "../../shared/infrastructure/persistence/fleet-orm";

export type BudgetPeriodType = "daily" | "weekly" | "monthly";

const FLEET_SCOPE = "";
const DAY_MS = 86_400_000;

export type FuelBudgetView = {
  id: string;
  vehicleId: string;
  scope: "vehicle" | "fleet";
  periodType: BudgetPeriodType;
  amountNgn: number;
};

export type BudgetVsActualRow = {
  vehicleId: string;
  periodType: BudgetPeriodType;
  budgetedNgn: number;
  actualNgn: number;
  variance: number;
  utilizationPct: number | null;
};

@Injectable()
export class FuelBudgetUseCase {
  constructor(
    @Inject(FUEL_RECORD_REPOSITORY) private readonly fuelRepo: FuelRecordRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  private async em() {
    const orm = await getFleetOrm(this.config.db);
    return orm.em.fork();
  }

  async list(tenantId: string): Promise<FuelBudgetView[]> {
    const em = await this.em();
    const records = await em.find(FleetFuelBudgetRecord, { tenantId });
    return records.map((r) => this.toView(r));
  }

  async upsert(
    tenantId: string,
    vehicleId: string,
    data: { periodType: BudgetPeriodType; amountNgn: number },
  ): Promise<FuelBudgetView> {
    const scopeId = this.normalizeScope(vehicleId);
    const em = await this.em();
    const existing = await em.findOne(FleetFuelBudgetRecord, { tenantId, vehicleId: scopeId });
    const record: FleetFuelBudgetRecord = {
      ...(existing ?? { id: randomUUID(), tenantId, vehicleId: scopeId, createdAt: new Date() }),
      periodType: data.periodType,
      amountNgn: data.amountNgn,
      updatedAt: new Date(),
    } as FleetFuelBudgetRecord;
    await em.upsert(FleetFuelBudgetRecord, record);
    return this.toView(record);
  }

  async budgetVsActual(tenantId: string, opts: { from?: string; to?: string }) {
    const windowEnd = opts.to ? new Date(opts.to) : new Date();
    const windowStart = opts.from
      ? new Date(opts.from)
      : new Date(windowEnd.getFullYear(), windowEnd.getMonth(), 1);
    const windowDays = Math.max(1, (windowEnd.getTime() - windowStart.getTime()) / DAY_MS);

    const [budgets, records] = await Promise.all([
      this.list(tenantId),
      this.fuelRepo
        .findAll({ tenantId, from: windowStart.toISOString(), to: windowEnd.toISOString() })
        .then((rs) => rs.map((r) => r.toPrimitives())),
    ]);

    const actualByVehicle = new Map<string, number>();
    let actualTotal = 0;
    for (const r of records) {
      actualByVehicle.set(r.vehicleId, (actualByVehicle.get(r.vehicleId) ?? 0) + r.totalCost);
      actualTotal += r.totalCost;
    }

    const vehicles = budgets
      .filter((b) => b.scope === "vehicle")
      .map((b) => this.row(b.vehicleId, b.periodType, b.amountNgn, windowDays, actualByVehicle.get(b.vehicleId) ?? 0));

    const fleetBudget = budgets.find((b) => b.scope === "fleet") ?? null;
    const fleet = fleetBudget
      ? this.row(FLEET_SCOPE, fleetBudget.periodType, fleetBudget.amountNgn, windowDays, actualTotal)
      : null;

    return {
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      windowDays: Math.round(windowDays * 10) / 10,
      vehicles,
      fleet,
    };
  }

  private row(
    vehicleId: string,
    periodType: BudgetPeriodType,
    amountNgn: number,
    windowDays: number,
    actualNgn: number,
  ): BudgetVsActualRow {
    const budgetedNgn = Math.round(this.scaleBudget(amountNgn, periodType, windowDays));
    const actual = Math.round(actualNgn);
    return {
      vehicleId,
      periodType,
      budgetedNgn,
      actualNgn: actual,
      variance: budgetedNgn - actual,
      utilizationPct: budgetedNgn > 0 ? Math.round((actual / budgetedNgn) * 1000) / 10 : null,
    };
  }

  private scaleBudget(amountNgn: number, periodType: BudgetPeriodType, windowDays: number): number {
    const perDay = periodType === "daily" ? amountNgn : periodType === "weekly" ? amountNgn / 7 : amountNgn / 30;
    return perDay * windowDays;
  }

  private normalizeScope(vehicleId: string): string {
    const v = vehicleId.trim();
    return v === "" || v.toLowerCase() === "all" || v.toLowerCase() === "fleet" ? FLEET_SCOPE : v;
  }

  private toView(record: FleetFuelBudgetRecord): FuelBudgetView {
    return {
      id: record.id,
      vehicleId: record.vehicleId,
      scope: record.vehicleId === FLEET_SCOPE ? "fleet" : "vehicle",
      periodType: (["daily", "weekly", "monthly"].includes(record.periodType)
        ? record.periodType
        : "monthly") as BudgetPeriodType,
      amountNgn: Number(record.amountNgn),
    };
  }
}
