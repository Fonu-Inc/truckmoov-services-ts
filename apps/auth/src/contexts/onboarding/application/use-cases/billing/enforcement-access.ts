import { SYSTEM_TENANT_ID } from '@shared/identity';
import { Role } from '@shared/rbac';
import { ForbiddenError } from '@auth/session';
import type { BillingActor } from '@auth/onboarding/domain/ports/billing-audit.port';

const STAFF_ROLES = new Set<string>([Role.SUPER_ADMIN, Role.SYSTEM_ADMIN]);

export function assertStaff(actor: BillingActor, message: string): void {
  if (actor.tenantId !== SYSTEM_TENANT_ID || !STAFF_ROLES.has(actor.role)) {
    throw new ForbiddenError(message);
  }
}

export function isSuperAdmin(actor: BillingActor): boolean {
  return actor.role === Role.SUPER_ADMIN;
}
