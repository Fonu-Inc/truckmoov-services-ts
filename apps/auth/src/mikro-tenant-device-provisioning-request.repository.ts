import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  getAuthOrm,
  TenantDeviceProvisioningRequestRecord,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type {
  StoredTenantDeviceProvisioningRequest,
  TenantDeviceProvisioningRequestRepository,
} from './tenant-device-provisioning-request.repository';

function toStored(
  r: TenantDeviceProvisioningRequestRecord,
): StoredTenantDeviceProvisioningRequest {
  return {
    id: r.id,
    tenantId: r.tenantId,
    manufacturer: r.manufacturer,
    model: r.model,
    quantity: r.quantity,
    useCase: r.useCase,
    requesterNotes: r.requesterNotes,
    status: r.status as StoredTenantDeviceProvisioningRequest['status'],
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

@Injectable()
export class MikroTenantDeviceProvisioningRequestRepository
  implements TenantDeviceProvisioningRequestRepository
{
  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async findAllByTenantId(
    tenantId: string,
  ): Promise<StoredTenantDeviceProvisioningRequest[]> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const records = await em.find(
      TenantDeviceProvisioningRequestRecord,
      { tenantId },
      { orderBy: { createdAt: 'desc' } },
    );
    return records.map(toStored);
  }

  async save(request: StoredTenantDeviceProvisioningRequest): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(TenantDeviceProvisioningRequestRecord, { ...request });
  }
}
