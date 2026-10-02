import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  getAuthOrm,
  TenantKycDocumentRecord,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type {
  KycDocumentQueueFilters,
  KycDocumentRepository,
  StoredKycDocument,
} from './tenant-kyc-document.repository';

function toStored(r: TenantKycDocumentRecord): StoredKycDocument {
  return {
    id: r.id,
    tenantId: r.tenantId,
    documentType: r.documentType as StoredKycDocument['documentType'],
    documentName: r.documentName,
    fileKey: r.fileKey,
    fileSize: r.fileSize,
    status: r.status as StoredKycDocument['status'],
    reviewedBy: r.reviewedBy ?? null,
    reviewedAt: r.reviewedAt ?? null,
    rejectionReason: r.rejectionReason ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

@Injectable()
export class MikroKycDocumentRepository implements KycDocumentRepository {
  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async findAllByTenantId(tenantId: string): Promise<StoredKycDocument[]> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const records = await em.find(
      TenantKycDocumentRecord,
      { tenantId },
      { orderBy: { createdAt: 'desc' } },
    );
    return records.map(toStored);
  }

  async findById(id: string): Promise<StoredKycDocument | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(TenantKycDocumentRecord, { id });
    return record ? toStored(record) : null;
  }

  async findForReview(
    filters?: KycDocumentQueueFilters,
  ): Promise<{ items: StoredKycDocument[]; total: number }> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();

    const where: Record<string, unknown> = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.tenantId !== undefined) where.tenantId = filters.tenantId;

    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 50;
    const [records, total] = await em.findAndCount(
      TenantKycDocumentRecord,
      where,
      { orderBy: { createdAt: 'asc' }, limit, offset: (page - 1) * limit },
    );
    return { items: records.map(toStored), total };
  }

  async save(doc: StoredKycDocument): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(TenantKycDocumentRecord, { ...doc });
  }

  async delete(id: string): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.nativeDelete(TenantKycDocumentRecord, { id });
  }
}
