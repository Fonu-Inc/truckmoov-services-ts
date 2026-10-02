import { Injectable } from '@nestjs/common';
import type {
  PermissionRemoval,
  PermissionRemovalRepository,
  PermissionRemovalStatus,
} from './permission-removal.repository';

@Injectable()
export class InMemoryPermissionRemovalRepository implements PermissionRemovalRepository {
  private readonly removals = new Map<string, PermissionRemoval>();

  async findById(id: string) {
    const removal = this.removals.get(id);
    return removal ? { ...removal } : null;
  }

  async activeForTenant(tenantId: string) {
    return this.all().filter((r) => r.tenantId === tenantId && r.status !== 'cancelled');
  }

  async list(filters: { tenantId?: string; status?: PermissionRemovalStatus }) {
    return this.all()
      .filter((r) => filters.tenantId === undefined || r.tenantId === filters.tenantId)
      .filter((r) => !filters.status || r.status === filters.status)
      .sort((a, b) => a.effectiveAt.getTime() - b.effectiveAt.getTime());
  }

  async dueBy(now: Date) {
    return (await this.list({ status: 'scheduled' })).filter((r) => r.effectiveAt <= now);
  }

  async save(removal: PermissionRemoval) {
    this.removals.set(removal.id, { ...removal });
  }

  private all() {
    return [...this.removals.values()].map((r) => ({ ...r }));
  }
}
