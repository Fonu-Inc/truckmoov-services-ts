import { Inject, Injectable } from '@nestjs/common';
import type { PermissionKey } from '@shared/access';
import { AppConfigService } from '@shared/config';
import { PermissionRemovalRecord, getAuthOrm } from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type {
  PermissionRemoval,
  PermissionRemovalRepository,
  PermissionRemovalStatus,
} from './permission-removal.repository';

function toRemoval(record: PermissionRemovalRecord): PermissionRemoval {
  return {
    ...record,
    permission: record.permission as PermissionKey,
    status: record.status as PermissionRemovalStatus,
  };
}

@Injectable()
export class MikroPermissionRemovalRepository implements PermissionRemovalRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  private async em() {
    return (await getAuthOrm(this.config.db)).em.fork();
  }

  async findById(id: string) {
    const row = await (await this.em()).findOne(PermissionRemovalRecord, { id });
    return row ? toRemoval(row) : null;
  }

  async activeForTenant(tenantId: string) {
    const rows = await (await this.em()).find(PermissionRemovalRecord, { tenantId, status: { $ne: 'cancelled' } });
    return rows.map(toRemoval);
  }

  async list(filters: { tenantId?: string; status?: PermissionRemovalStatus }) {
    const where: Record<string, unknown> = {};
    if (filters.tenantId) where.tenantId = filters.tenantId;
    if (filters.status) where.status = filters.status;
    const rows = await (await this.em()).find(PermissionRemovalRecord, where, { orderBy: { effectiveAt: 'asc' } });
    return rows.map(toRemoval);
  }

  async dueBy(now: Date) {
    const rows = await (await this.em()).find(
      PermissionRemovalRecord,
      { status: 'scheduled', effectiveAt: { $lte: now } },
      { orderBy: { effectiveAt: 'asc' } },
    );
    return rows.map(toRemoval);
  }

  async save(removal: PermissionRemoval) {
    await (await this.em()).upsert(PermissionRemovalRecord, removal);
  }
}
