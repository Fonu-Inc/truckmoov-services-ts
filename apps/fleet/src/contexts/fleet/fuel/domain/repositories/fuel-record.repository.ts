import type { FuelRecord } from "../entities/fuel-record.entity";

export type FuelRecordFilters = {
  tenantId?: string;
  vehicleId?: string;
  driverId?: string;
  station?: string;
  from?: string;
  to?: string;
  includeDeleted?: boolean;
};

export interface FuelRecordRepository {
  save(record: FuelRecord): Promise<void>;
  findById(id: string, tenantId: string): Promise<FuelRecord | null>;
  findAll(filters?: FuelRecordFilters): Promise<FuelRecord[]>;
}

export const FUEL_RECORD_REPOSITORY = Symbol("FUEL_RECORD_REPOSITORY");
