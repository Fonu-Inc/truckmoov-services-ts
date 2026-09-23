import type { PermissionKey } from '@shared/access';

export type PermissionRemovalStatus = 'scheduled' | 'applied' | 'cancelled';

/**
 * A permission the governance team takes away from one tenant. Never abrupt:
 * it has an effective date, can be cancelled until then, and from then on
 * no role in the tenant carries the permission, predefined or custom.
 */
export type PermissionRemoval = {
  id: string;
  tenantId: string;
  permission: PermissionKey;
  effectiveAt: Date;
  reason: string;
  status: PermissionRemovalStatus;
  createdBy: string;
  createdAt: Date;
  cancelledBy: string | null;
  cancelledAt: Date | null;
  appliedAt: Date | null;
};

export interface PermissionRemovalRepository {
  findById(id: string): Promise<PermissionRemoval | null>;
  /** Scheduled or applied removals for the tenant; cancelled ones are gone. */
  activeForTenant(tenantId: string): Promise<PermissionRemoval[]>;
  list(filters: { tenantId?: string; status?: PermissionRemovalStatus }): Promise<PermissionRemoval[]>;
  /** Scheduled removals whose time has come, oldest first. */
  dueBy(now: Date): Promise<PermissionRemoval[]>;
  save(removal: PermissionRemoval): Promise<void>;
}

export const PERMISSION_REMOVAL_REPOSITORY = Symbol('PERMISSION_REMOVAL_REPOSITORY');
