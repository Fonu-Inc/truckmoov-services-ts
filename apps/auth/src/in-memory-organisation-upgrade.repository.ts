import { Injectable } from '@nestjs/common';
import type {
  OrganisationUpgradeRepository,
  OrganisationUpgradeRequest,
  UpgradeRequestStatus,
} from './organisation-upgrade.repository';

@Injectable()
export class InMemoryOrganisationUpgradeRepository implements OrganisationUpgradeRepository {
  private readonly byId = new Map<string, OrganisationUpgradeRequest>();

  async save(request: OrganisationUpgradeRequest): Promise<void> {
    this.byId.set(request.id, { ...request });
  }

  async findById(id: string): Promise<OrganisationUpgradeRequest | null> {
    const found = this.byId.get(id);
    return found ? { ...found } : null;
  }

  async findOpenForTenant(tenantId: string): Promise<OrganisationUpgradeRequest | null> {
    return (
      [...this.byId.values()].find(
        (request) => request.tenantId === tenantId && request.status === 'pending',
      ) ?? null
    );
  }

  async findByStatus(status: UpgradeRequestStatus): Promise<OrganisationUpgradeRequest[]> {
    return [...this.byId.values()]
      .filter((request) => request.status === status)
      .sort((left, right) => left.requestedAt.localeCompare(right.requestedAt));
  }

  async countPending(): Promise<number> {
    return (await this.findByStatus('pending')).length;
  }

  async findRecentlyReviewed(limit: number): Promise<OrganisationUpgradeRequest[]> {
    return [...this.byId.values()]
      .filter((request) => request.status !== 'pending')
      .sort((left, right) => (right.reviewedAt ?? '').localeCompare(left.reviewedAt ?? ''))
      .slice(0, limit);
  }
}
