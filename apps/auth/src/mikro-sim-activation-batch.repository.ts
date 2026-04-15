import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  getAuthOrm,
  SimActivationBatchRecord,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type {
  SimActivationBatchRepository,
  StoredSimActivationBatch,
} from './sim-activation-batch.repository';

function toStored(record: SimActivationBatchRecord): StoredSimActivationBatch {
  return {
    id: record.id,
    requestId: record.requestId,
    tenantId: record.tenantId,
    tenantName: record.tenantName,
    activationMode: record.activationMode,
    quantity: record.quantity,
    operator: record.operator,
    requestedPlan: record.requestedPlan,
    dataLimitGb: Number(record.dataLimitGb),
    deviceMappingData: record.deviceMappingData,
    status: record.status,
    simsActivated: record.simsActivated,
    simsFailed: record.simsFailed,
    fonuResponse: record.fonuResponse,
    createdBy: record.createdBy,
    createdByName: record.createdByName,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    errorMessage: record.errorMessage,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

@Injectable()
export class MikroSimActivationBatchRepository
  implements SimActivationBatchRepository
{
  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async findAll(filters?: {
    status?: string;
  }): Promise<StoredSimActivationBatch[]> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const where: Record<string, unknown> = {};
    if (filters?.status) where.status = filters.status;
    const records = await em.find(SimActivationBatchRecord, where, {
      orderBy: { createdAt: 'desc' },
    });
    return records.map(toStored);
  }

  async findById(id: string): Promise<StoredSimActivationBatch | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(SimActivationBatchRecord, { id });
    return record ? toStored(record) : null;
  }

  async save(batch: StoredSimActivationBatch): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(SimActivationBatchRecord, { ...batch });
  }
}
