import { Injectable } from "@nestjs/common";
import type { FuelEfficiencyThreshold, FuelThresholdRepository } from "../domain/repositories/fuel-threshold.repository";

@Injectable()
export class InMemoryFuelThresholdRepository implements FuelThresholdRepository {
  private readonly byTenant = new Map<string, Map<string, FuelEfficiencyThreshold>>();

  async upsert(tenantId: string, threshold: FuelEfficiencyThreshold): Promise<void> {
    const thresholds = this.byTenant.get(tenantId) ?? new Map<string, FuelEfficiencyThreshold>();
    thresholds.set(threshold.vehicleType, threshold);
    this.byTenant.set(tenantId, thresholds);
  }

  async findOne(tenantId: string, vehicleType: string): Promise<FuelEfficiencyThreshold | null> {
    return this.byTenant.get(tenantId)?.get(vehicleType) ?? null;
  }

  async findAll(tenantId: string): Promise<FuelEfficiencyThreshold[]> {
    return [...(this.byTenant.get(tenantId)?.values() ?? [])];
  }

  async delete(tenantId: string, vehicleType: string): Promise<boolean> {
    return this.byTenant.get(tenantId)?.delete(vehicleType) ?? false;
  }
}
