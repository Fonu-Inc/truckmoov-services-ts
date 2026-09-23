import { Inject, Injectable } from '@nestjs/common';
import type { PermissionKey } from '@shared/access';
import { AppConfigService } from '@shared/config';
import { TenantRoleRecord, getAuthOrm } from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type { TenantRole, TenantRoleRepository } from './tenant-role.repository';

function toRole(record: TenantRoleRecord): TenantRole {
  return {
    id: record.id,
    tenantId: record.tenantId,
    name: record.name,
    description: record.description,
    permissions: (record.permissions ?? []) as PermissionKey[],
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

@Injectable()
export class MikroTenantRoleRepository implements TenantRoleRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  private async em() {
    return (await getAuthOrm(this.config.db)).em.fork();
  }

  async findById(tenantId: string, id: string) {
    const row = await (await this.em()).findOne(TenantRoleRecord, { id, tenantId });
    return row ? toRole(row) : null;
  }

  async findByName(tenantId: string, name: string) {
    const rows = await (await this.em()).getConnection().execute<Array<{ id: string }>>(
      `select id from tenant_roles where tenant_id = ? and lower(name) = lower(?) limit 1`,
      [tenantId, name.trim()],
    );
    return rows[0] ? this.findById(tenantId, rows[0].id) : null;
  }

  async listByTenant(tenantId: string) {
    const rows = await (await this.em()).find(TenantRoleRecord, { tenantId }, { orderBy: { name: 'asc' } });
    return rows.map(toRole);
  }

  async save(role: TenantRole) {
    await (await this.em()).upsert(TenantRoleRecord, { ...role, updatedAt: new Date() });
  }

  async delete(tenantId: string, id: string) {
    await (await this.em()).nativeDelete(TenantRoleRecord, { id, tenantId });
  }
}
