import type {
  Device,
  DeviceLifecycleStatus,
  DeviceStatus,
  DeviceVerificationStatus,
} from "../entities/device.entity";

export type DeviceFilters = {
  tenantId?: string;
  query?: string;
  manufacturer?: string;
  status?: DeviceStatus;
  lifecycleStatus?: DeviceLifecycleStatus;
  lifecycleStatusIn?: DeviceLifecycleStatus[];
  verificationStatus?: DeviceVerificationStatus;
  verifiedAfter?: Date;
  assigned?: boolean;
  vehicleId?: string;
  lastSeenAfter?: Date;
  lastSeenIsNull?: boolean;
};

export interface DeviceRepository {
  save(device: Device): Promise<void>;
  findAll(filters?: DeviceFilters): Promise<Device[]>;
  findById(id: string, tenantId: string): Promise<Device | null>;
  /**
   * A device by id alone, whatever tenant holds it. Only the platform calls
   * this: an administrator suspending a device does not know, and should not
   * have to supply, which tenant it belongs to.
   */
  findByIdAcrossTenants(id: string): Promise<Device | null>;
  findByImei(imei: string, tenantId: string): Promise<Device | null>;
  findByVehicleId(vehicleId: string, tenantId: string): Promise<Device | null>;
  deleteById(id: string, tenantId: string): Promise<void>;
  /**
   * Devices whose waiting window has closed, across every tenant. The sweep
   * that fails them runs platform-wide, so this deliberately takes no tenant.
   */
  findAwaitingVerificationPastDeadline(now: Date, limit: number): Promise<Device[]>;
}

export const DEVICE_REPOSITORY = Symbol("DEVICE_REPOSITORY");
