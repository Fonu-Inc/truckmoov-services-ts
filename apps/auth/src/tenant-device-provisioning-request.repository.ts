export type StoredTenantDeviceProvisioningRequest = {
  id: string;
  tenantId: string;
  manufacturer: string;
  model: string;
  quantity: number;
  useCase: string | null;
  requesterNotes: string | null;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
};

export interface TenantDeviceProvisioningRequestRepository {
  findAllByTenantId(
    tenantId: string,
  ): Promise<StoredTenantDeviceProvisioningRequest[]>;
  save(request: StoredTenantDeviceProvisioningRequest): Promise<void>;
}

export const TENANT_DEVICE_PROVISIONING_REQUEST_REPOSITORY = Symbol(
  'TENANT_DEVICE_PROVISIONING_REQUEST_REPOSITORY',
);
