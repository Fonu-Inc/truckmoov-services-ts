import type { Device, DeviceLifecycleStatus, DeviceStatus } from "../entities/device.entity";

export type DeviceFilters = {
  tenantId?: string;
  query?: string;
  manufacturer?: string;
  status?: DeviceStatus;
  lifecycleStatus?: DeviceLifecycleStatus;
  assigned?: boolean;
  vehicleId?: string;
};

export interface DeviceRepository {
  save(device: Device): Promise<void>;
  findAll(filters?: DeviceFilters): Promise<Device[]>;
  findById(id: string): Promise<Device | null>;
  findByImei(imei: string, tenantId: string): Promise<Device | null>;
  findByVehicleId(vehicleId: string): Promise<Device | null>;
  deleteById(id: string): Promise<void>;
}

export const DEVICE_REPOSITORY = Symbol("DEVICE_REPOSITORY");
