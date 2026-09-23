import { Injectable } from '@nestjs/common';
import type { TenantRole, TenantRoleRepository } from './tenant-role.repository';

@Injectable()
export class InMemoryTenantRoleRepository implements TenantRoleRepository {
  private readonly roles = new Map<string, TenantRole>();

  async findById(tenantId: string, id: string) {
    const role = this.roles.get(id);
    return role && role.tenantId === tenantId ? { ...role } : null;
  }

  async findByName(tenantId: string, name: string) {
    const wanted = name.trim().toLowerCase();
    const role = [...this.roles.values()].find((r) => r.tenantId === tenantId && r.name.toLowerCase() === wanted);
    return role ? { ...role } : null;
  }

  async listByTenant(tenantId: string) {
    return [...this.roles.values()]
      .filter((r) => r.tenantId === tenantId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((r) => ({ ...r }));
  }

  async save(role: TenantRole) {
    this.roles.set(role.id, { ...role });
  }

  async delete(tenantId: string, id: string) {
    if (this.roles.get(id)?.tenantId === tenantId) this.roles.delete(id);
  }
}
