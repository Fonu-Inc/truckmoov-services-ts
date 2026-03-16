import type { Driver } from "../entities/driver.entity";
import type { FleetAssetStatus } from "../../../shared/domain/fleet-status";

export type DriverFilters = {
  tenantId?: string;
  query?: string;
  status?: FleetAssetStatus;
  assigned?: boolean;
};

export interface DriverRepository {
  save(driver: Driver): Promise<void>;
  findAll(filters?: DriverFilters): Promise<Driver[]>;
  findById(id: string): Promise<Driver | null>;
  findByLicenseNumber(licenseNumber: string, tenantId: string): Promise<Driver | null>;
  findByAssignedVehicleId(vehicleId: string): Promise<Driver | null>;
  findByWhatsappNumber(whatsappNumber: string, tenantId: string): Promise<Driver | null>;
  deleteById(id: string): Promise<void>;
}

export const DRIVER_REPOSITORY = Symbol("DRIVER_REPOSITORY");
