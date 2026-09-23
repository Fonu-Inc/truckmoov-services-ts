import type { PermissionKey } from '@shared/access';

/**
 * A role a tenant built for itself, from tenant-portal permissions only.
 * Predefined roles live in code and are never stored here.
 */
export type TenantRole = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  permissions: PermissionKey[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export interface TenantRoleRepository {
  findById(tenantId: string, id: string): Promise<TenantRole | null>;
  findByName(tenantId: string, name: string): Promise<TenantRole | null>;
  listByTenant(tenantId: string): Promise<TenantRole[]>;
  save(role: TenantRole): Promise<void>;
  delete(tenantId: string, id: string): Promise<void>;
}

export const TENANT_ROLE_REPOSITORY = Symbol('TENANT_ROLE_REPOSITORY');
