import type { Vehicle } from "../entities/vehicle.entity";
import type { FleetAssetStatus } from "../../../shared/domain/fleet-status";

export type VehicleFilters = {
  tenantId?: string;
  query?: string;
  status?: FleetAssetStatus;
  assigned?: boolean;
  type?: string;
  yearFrom?: number;
  yearTo?: number;
};

export interface VehicleRepository {
  save(vehicle: Vehicle): Promise<void>;
  findAll(filters?: VehicleFilters): Promise<Vehicle[]>;
  findById(id: string, tenantId: string): Promise<Vehicle | null>;
  findByPlateNumber(plateNumber: string, tenantId: string): Promise<Vehicle | null>;
  findByAssignedDriverId(driverId: string, tenantId: string): Promise<Vehicle | null>;
  deleteById(id: string, tenantId: string): Promise<void>;
}

export const VEHICLE_REPOSITORY = Symbol("VEHICLE_REPOSITORY");
