import { Injectable } from '@nestjs/common';
import type {
  StoredTenantDeviceProvisioningRequest,
  TenantDeviceProvisioningRequestRepository,
} from './tenant-device-provisioning-request.repository';

@Injectable()
export class InMemoryTenantDeviceProvisioningRequestRepository
  implements TenantDeviceProvisioningRequestRepository
{
  private readonly store = new Map<
    string,
    StoredTenantDeviceProvisioningRequest
  >();

  async findAllByTenantId(
    tenantId: string,
  ): Promise<StoredTenantDeviceProvisioningRequest[]> {
    return [...this.store.values()]
      .filter((r) => r.tenantId === tenantId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async save(request: StoredTenantDeviceProvisioningRequest): Promise<void> {
    this.store.set(request.id, request);
  }
}
