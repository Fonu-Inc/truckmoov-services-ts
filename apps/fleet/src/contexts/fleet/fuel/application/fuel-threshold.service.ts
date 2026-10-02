import { Inject, Injectable } from "@nestjs/common";
import {
  FUEL_THRESHOLD_REPOSITORY,
  type FuelEfficiencyThreshold,
  type FuelThresholdRepository,
} from "../domain/repositories/fuel-threshold.repository";

export type { FuelEfficiencyThreshold };

@Injectable()
export class FuelThresholdService {
  constructor(@Inject(FUEL_THRESHOLD_REPOSITORY) private readonly repo: FuelThresholdRepository) {}

  async set(tenantId: string, vehicleType: string, minKmPerLiter: number): Promise<FuelEfficiencyThreshold> {
    if (minKmPerLiter <= 0) throw new Error("minKmPerLiter must be positive");
    const threshold = { vehicleType, minKmPerLiter };
    await this.repo.upsert(tenantId, threshold);
    return threshold;
  }

  async get(tenantId: string, vehicleType: string): Promise<FuelEfficiencyThreshold | null> {
    return (await this.repo.findOne(tenantId, vehicleType)) ?? (await this.repo.findOne(tenantId, "default"));
  }

  getAll(tenantId: string): Promise<FuelEfficiencyThreshold[]> {
    return this.repo.findAll(tenantId);
  }

  delete(tenantId: string, vehicleType: string): Promise<boolean> {
    return this.repo.delete(tenantId, vehicleType);
  }
}
