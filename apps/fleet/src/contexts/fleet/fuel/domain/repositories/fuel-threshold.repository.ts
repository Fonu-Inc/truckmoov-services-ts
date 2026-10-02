export type FuelEfficiencyThreshold = {
  vehicleType: string;
  minKmPerLiter: number;
};

export interface FuelThresholdRepository {
  upsert(tenantId: string, threshold: FuelEfficiencyThreshold): Promise<void>;
  findOne(tenantId: string, vehicleType: string): Promise<FuelEfficiencyThreshold | null>;
  findAll(tenantId: string): Promise<FuelEfficiencyThreshold[]>;
  delete(tenantId: string, vehicleType: string): Promise<boolean>;
}

export const FUEL_THRESHOLD_REPOSITORY = Symbol("FUEL_THRESHOLD_REPOSITORY");
