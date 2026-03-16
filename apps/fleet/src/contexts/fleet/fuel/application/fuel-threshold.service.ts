import { Injectable } from "@nestjs/common";

export type FuelEfficiencyThreshold = {
  vehicleType: string;
  minKmPerLiter: number;
};

@Injectable()
export class FuelThresholdService {
  private readonly thresholds = new Map<string, FuelEfficiencyThreshold>();

  set(vehicleType: string, minKmPerLiter: number): FuelEfficiencyThreshold {
    if (minKmPerLiter <= 0) throw new Error("minKmPerLiter must be positive");
    const threshold = { vehicleType, minKmPerLiter };
    this.thresholds.set(vehicleType, threshold);
    return threshold;
  }

  get(vehicleType: string): FuelEfficiencyThreshold | null {
    return this.thresholds.get(vehicleType) ?? this.thresholds.get("default") ?? null;
  }

  getAll(): FuelEfficiencyThreshold[] {
    return [...this.thresholds.values()];
  }

  delete(vehicleType: string): boolean {
    return this.thresholds.delete(vehicleType);
  }
}
