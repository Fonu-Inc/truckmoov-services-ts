import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  getAuthOrm,
  SimProvisioningRequestRecord,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type {
  SimProvisioningRequestRepository,
  StoredSimProvisioningRequest,
} from './sim-provisioning-request.repository';

function toStored(
  record: SimProvisioningRequestRecord,
): StoredSimProvisioningRequest {
  return {
    id: record.id,
    tenantId: record.tenantId,
    tenantName: record.tenantName,
    requestType: record.requestType,
    numberOfSims: record.numberOfSims,
    preferredOperator: record.preferredOperator,
    requestedPlan: record.requestedPlan,
    requestedDataLimitMb: record.requestedDataLimitMb,
    deploymentTimeline: record.deploymentTimeline,
    useCase: record.useCase,
    deviceMappingData: record.deviceMappingData,
    status: record.status,
    approvedBy: record.approvedBy,
    approvedByName: record.approvedByName,
    approvedAt: record.approvedAt,
    rejectedReason: record.rejectedReason,
    fonuRequestId: record.fonuRequestId,
    fonuResponse: record.fonuResponse,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

@Injectable()
export class MikroSimProvisioningRequestRepository
  implements SimProvisioningRequestRepository
{
  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async findAll(filters?: {
    status?: string;
  }): Promise<StoredSimProvisioningRequest[]> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const where: Record<string, unknown> = {};
    if (filters?.status) where.status = filters.status;
    const records = await em.find(SimProvisioningRequestRecord, where, {
      orderBy: { createdAt: 'desc' },
    });
    return records.map(toStored);
  }

  async findById(id: string): Promise<StoredSimProvisioningRequest | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(SimProvisioningRequestRecord, { id });
    return record ? toStored(record) : null;
  }

  async save(request: StoredSimProvisioningRequest): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(SimProvisioningRequestRecord, { ...request });
  }
}
