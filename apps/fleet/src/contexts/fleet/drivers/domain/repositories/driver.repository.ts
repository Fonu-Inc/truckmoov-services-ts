import type {
  Driver,
  FleetDriverStatus,
} from "../entities/driver.entity";

export type DriverFilters = {
  tenantId?: string;
  query?: string;
  status?: FleetDriverStatus;
  assigned?: boolean;
};

export interface DriverRepository {
  save(driver: Driver): Promise<void>;
  findAll(filters?: DriverFilters): Promise<Driver[]>;
  findById(id: string, tenantId: string): Promise<Driver | null>;
  findByLicenseNumber(licenseNumber: string, tenantId: string): Promise<Driver | null>;
  findByAssignedVehicleId(vehicleId: string, tenantId: string): Promise<Driver | null>;
  findByWhatsappNumber(whatsappNumber: string, tenantId: string): Promise<Driver | null>;
  /** Drivers in any tenant who list one of these numbers, for platform staff matching a caller. */
  findByNumbersAcrossTenants(numbers: string[], limit: number): Promise<Driver[]>;
  deleteById(id: string, tenantId: string): Promise<void>;
}

export const DRIVER_REPOSITORY = Symbol("DRIVER_REPOSITORY");
