import type { DeviceSetupRequest, DeviceSetupRequestStatus } from "../entities/device-setup-request.entity";

export type DeviceSetupRequestFilters = {
  tenantId?: string;
  status?: DeviceSetupRequestStatus;
  query?: string;
};

export interface DeviceSetupRequestRepository {
  save(request: DeviceSetupRequest): Promise<void>;
  findAll(filters?: DeviceSetupRequestFilters): Promise<DeviceSetupRequest[]>;
  findById(id: string, tenantId: string): Promise<DeviceSetupRequest | null>;
  deleteById(id: string, tenantId: string): Promise<void>;
}

export const DEVICE_SETUP_REQUEST_REPOSITORY = Symbol("DEVICE_SETUP_REQUEST_REPOSITORY");
