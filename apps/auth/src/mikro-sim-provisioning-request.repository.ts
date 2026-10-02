import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  getAuthOrm,
  SimProvisioningRequestRecord,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type {
  SimProvisioningRequestFilters,
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

function buildWhere(
  filters?: SimProvisioningRequestFilters,
): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (filters?.tenantId !== undefined) where.tenantId = filters.tenantId;
  if (filters?.status) where.status = filters.status;
  if (filters?.carrier) where.preferredOperator = filters.carrier;
  if (filters?.organisation) {
    where.$or = [
      { tenantId: filters.organisation },
      { tenantName: { $ilike: `%${filters.organisation}%` } },
    ];
  }
  if (filters?.useCase) where.useCase = { $ilike: `%${filters.useCase}%` };
  if (filters?.search) {
    const q = `%${filters.search}%`;
    where.$and = [
      {
        $or: [
          { tenantName: { $ilike: q } },
          { preferredOperator: { $ilike: q } },
          { id: { $ilike: q } },
        ],
      },
    ];
  }
  return where;
}

@Injectable()
export class MikroSimProvisioningRequestRepository
  implements SimProvisioningRequestRepository
{
  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async findAll(
    filters?: SimProvisioningRequestFilters,
  ): Promise<StoredSimProvisioningRequest[]> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const records = await em.find(SimProvisioningRequestRecord, buildWhere(filters), {
      orderBy: { createdAt: 'desc' },
      limit: filters?.limit,
      offset: filters?.offset,
    });
    return records.map(toStored);
  }

  async count(filters?: SimProvisioningRequestFilters): Promise<number> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    return em.count(SimProvisioningRequestRecord, buildWhere(filters));
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
