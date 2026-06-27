import { Inject, Injectable } from "@nestjs/common";
import { FUEL_RECORD_REPOSITORY, type FuelRecordRepository } from "../domain/repositories/fuel-record.repository";
import { FLEET_RUNTIME, type FleetRuntime } from "../../shared/domain/ports/fleet-runtime.port";
import { FuelThresholdService } from "./fuel-threshold.service";
import type { FuelRecord } from "../domain/entities/fuel-record.entity";

export type MetricsPeriod = "weekly" | "monthly";

export type FuelTypeBreakdown = {
  liters: number;
  totalCost: number;
  records: number;
};

export type ConsumptionBucket = {
  label: string;
  liters: number;
  totalCost: number;
  records: number;
  // Per-fuel-type split (diesel/petrol/ev/hybrid/unknown) backing the weekly diesel-vs-petrol chart.
  byFuelType: Record<string, FuelTypeBreakdown>;
};

export type VehicleEfficiency = {
  vehicleId: string;
  kmPerLiter: number | null;
  belowThreshold: boolean;
  threshold: number | null;
};

@Injectable()
export class FuelMetricsUseCase {
  constructor(
    @Inject(FUEL_RECORD_REPOSITORY) private readonly repo: FuelRecordRepository,
    @Inject(FLEET_RUNTIME) private readonly runtime: FleetRuntime,
    private readonly thresholds: FuelThresholdService,
  ) {}

  async consumption(tenantId: string | undefined, period: MetricsPeriod): Promise<ConsumptionBucket[]> {
    const tid = tenantId ?? this.runtime.getDefaultTenantId();
    const records = await this.repo.findAll({ tenantId: tid });

    const buckets = new Map<string, ConsumptionBucket>();
    for (const r of records) {
      const label = period === "weekly" ? isoWeek(r.recordedAt) : isoMonth(r.recordedAt);
      const b = buckets.get(label) ?? { label, liters: 0, totalCost: 0, records: 0, byFuelType: {} };
      b.liters = +(b.liters + r.liters).toFixed(2);
      b.totalCost = +(b.totalCost + r.totalCost).toFixed(2);
      b.records++;

      const ft = r.fuelType ?? "unknown";
      const slot = b.byFuelType[ft] ?? { liters: 0, totalCost: 0, records: 0 };
      slot.liters = +(slot.liters + r.liters).toFixed(2);
      slot.totalCost = +(slot.totalCost + r.totalCost).toFixed(2);
      slot.records++;
      b.byFuelType[ft] = slot;

      buckets.set(label, b);
    }

    return [...buckets.values()].sort((a, b) => a.label.localeCompare(b.label));
  }

  async efficiency(tenantId: string | undefined): Promise<VehicleEfficiency[]> {
    const tid = tenantId ?? this.runtime.getDefaultTenantId();
    const records = await this.repo.findAll({ tenantId: tid });

    const byVehicle = new Map<string, FuelRecord[]>();
    for (const r of records) {
      const arr = byVehicle.get(r.vehicleId) ?? [];
      arr.push(r);
      byVehicle.set(r.vehicleId, arr);
    }

    return [...byVehicle.entries()].map(([vehicleId, recs]) => {
      const sorted = recs
        .filter((r) => r.odometer !== null)
        .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));

      if (sorted.length < 2) {
        return { vehicleId, kmPerLiter: null, belowThreshold: false, threshold: null };
      }

      const totalKm = sorted[sorted.length - 1].odometer! - sorted[0].odometer!;
      const totalLiters = sorted.slice(1).reduce((sum, r) => sum + r.liters, 0);
      const kmPerLiter = totalLiters > 0 ? +(totalKm / totalLiters).toFixed(2) : null;

      const vehicleType = recs.find((r) => r.vehicleType)?.vehicleType ?? null;
      const thr = this.thresholds.get(vehicleType ?? "default");

      return {
        vehicleId,
        kmPerLiter,
        belowThreshold: kmPerLiter !== null && thr !== null && kmPerLiter < thr.minKmPerLiter,
        threshold: thr?.minKmPerLiter ?? null,
      };
    });
  }
}

function isoWeek(isoDate: string): string {
  const d = new Date(isoDate);
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function isoMonth(isoDate: string): string {
  const d = new Date(isoDate);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
