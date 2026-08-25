import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  OrganisationUpgradeRequestRecord,
  getAuthOrm,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type {
  OrganisationUpgradeRepository,
  OrganisationUpgradeRequest,
  UpgradeRequestStatus,
} from './organisation-upgrade.repository';
import type { TenantOrganizationType } from './tenant-onboarding.repository';

function toRequest(record: OrganisationUpgradeRequestRecord): OrganisationUpgradeRequest {
  return {
    id: record.id,
    tenantId: record.tenantId,
    fromOrganisationType: record.fromOrganisationType as TenantOrganizationType,
    toOrganisationType: record.toOrganisationType as TenantOrganizationType,
    reason: record.reason,
    statedVehicleCount: record.statedVehicleCount,
    status: record.status as UpgradeRequestStatus,
    requestedBy: record.requestedBy,
    requestedAt: record.requestedAt.toISOString(),
    reviewedBy: record.reviewedBy,
    reviewedAt: record.reviewedAt?.toISOString() ?? null,
    reviewerNotes: record.reviewerNotes,
    vehicleCountAtReview: record.vehicleCountAtReview,
  };
}

@Injectable()
export class MikroOrganisationUpgradeRepository implements OrganisationUpgradeRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async save(request: OrganisationUpgradeRequest): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    await orm.em.fork().upsert(OrganisationUpgradeRequestRecord, {
      id: request.id,
      tenantId: request.tenantId,
      fromOrganisationType: request.fromOrganisationType,
      toOrganisationType: request.toOrganisationType,
      reason: request.reason,
      statedVehicleCount: request.statedVehicleCount,
      status: request.status,
      requestedBy: request.requestedBy,
      requestedAt: new Date(request.requestedAt),
      reviewedBy: request.reviewedBy,
      reviewedAt: request.reviewedAt ? new Date(request.reviewedAt) : null,
      reviewerNotes: request.reviewerNotes,
      vehicleCountAtReview: request.vehicleCountAtReview,
    });
  }

  async findById(id: string): Promise<OrganisationUpgradeRequest | null> {
    const orm = await getAuthOrm(this.config.db);
    const record = await orm.em.fork().findOne(OrganisationUpgradeRequestRecord, { id });
    return record ? toRequest(record) : null;
  }

  async findOpenForTenant(tenantId: string): Promise<OrganisationUpgradeRequest | null> {
    const orm = await getAuthOrm(this.config.db);
    const record = await orm.em
      .fork()
      .findOne(OrganisationUpgradeRequestRecord, { tenantId, status: 'pending' } as never);
    return record ? toRequest(record) : null;
  }

  async findByStatus(status: UpgradeRequestStatus): Promise<OrganisationUpgradeRequest[]> {
    const orm = await getAuthOrm(this.config.db);
    const records = await orm.em
      .fork()
      .find(OrganisationUpgradeRequestRecord, { status } as never, {
        orderBy: { requestedAt: 'asc' },
      });
    return records.map(toRequest);
  }

  async countPending(): Promise<number> {
    const orm = await getAuthOrm(this.config.db);
    return orm.em.fork().count(OrganisationUpgradeRequestRecord, { status: 'pending' } as never);
  }

  async findRecentlyReviewed(limit: number): Promise<OrganisationUpgradeRequest[]> {
    const orm = await getAuthOrm(this.config.db);
    const records = await orm.em
      .fork()
      .find(OrganisationUpgradeRequestRecord, { status: { $ne: 'pending' } } as never, {
        orderBy: { reviewedAt: 'desc' },
        limit,
      });
    return records.map(toRequest);
  }
}
