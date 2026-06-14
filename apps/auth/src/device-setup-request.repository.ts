export type DeviceSetupRequestStatus = 'pending_review' | 'in_progress' | 'assigned';

export type StoredDeviceSetupRequest = {
  id: string;
  imei: string;
  manufacturer: string;
  model: string;
  connectionType: string;
  requesterName: string;
  needsSim: boolean;
  vehiclePlate: string | null;
  location: string | null;
  tenantId: string;
  status: DeviceSetupRequestStatus;
  assignedTo: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type DeviceSetupRequestFilters = {
  status?: string;
  tenantId?: string;
  search?: string;
};

export interface DeviceSetupRequestRepository {
  findAll(filters?: DeviceSetupRequestFilters): Promise<StoredDeviceSetupRequest[]>;
  findById(id: string): Promise<StoredDeviceSetupRequest | null>;
  save(request: StoredDeviceSetupRequest): Promise<void>;
}

export const DEVICE_SETUP_REQUEST_REPOSITORY = Symbol('DEVICE_SETUP_REQUEST_REPOSITORY');
