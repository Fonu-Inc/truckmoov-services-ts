import type { Vehicle } from "../entities/vehicle.entity";
import type { FleetAssetStatus } from "../../../shared/domain/fleet-status";

export type VehicleFilters = {
  tenantId: string;
  /**
   * Set for an owner operator so a seat inside somebody else's tenant sees only
   * its own vehicles. Never accepted from the request: it is derived from the
   * caller's own identity.
   */
  ownerOperatorId?: string;
  query?: string;
  status?: FleetAssetStatus;
  assigned?: boolean;
  type?: string;
  yearFrom?: number;
  yearTo?: number;
};

export interface VehicleRepository {
  save(vehicle: Vehicle): Promise<void>;
  findAll(filters: VehicleFilters): Promise<Vehicle[]>;
  /** Ids only, for callers that need to know what exists and nothing about it. */
  listIdsByTenant(tenantId: string): Promise<string[]>;
  findById(id: string, tenantId: string): Promise<Vehicle | null>;
  findByPlateNumber(plateNumber: string, tenantId: string): Promise<Vehicle | null>;
  findByAssignedDriverId(driverId: string, tenantId: string): Promise<Vehicle | null>;
  /** All vehicles owned by this operator, for scoping compliance/document views. */
  findAllByOwnerOperatorId(ownerOperatorId: string, tenantId: string): Promise<Vehicle[]>;
  deleteById(id: string, tenantId: string): Promise<void>;
}

export const VEHICLE_REPOSITORY = Symbol("VEHICLE_REPOSITORY");
