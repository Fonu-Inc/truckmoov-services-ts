import { describe, expect, it } from 'vitest';
import { Role } from '@shared/rbac';
import {
  ORG_TYPE_TO_BOOTSTRAP_ROLE,
  TENANT_ORGANIZATION_TYPES,
} from '../../../apps/auth/src/tenant-onboarding.repository';

describe('tenant bootstrap role', () => {
  it('never bootstraps a customer organisation into the internal system role', () => {
    const internalRoles = [Role.PLATFORM_ADMIN, Role.SUPER_ADMIN, Role.SYSTEM_ADMIN];

    for (const role of Object.values(ORG_TYPE_TO_BOOTSTRAP_ROLE)) {
      expect(internalRoles).not.toContain(role);
    }
  });

  it('gives a fleet provider its own admin role', () => {
    expect(ORG_TYPE_TO_BOOTSTRAP_ROLE.fleet_provider).toBe(Role.OWNER_OPERATOR);
  });

  it('covers every organisation type', () => {
    for (const organizationType of TENANT_ORGANIZATION_TYPES) {
      expect(ORG_TYPE_TO_BOOTSTRAP_ROLE[organizationType]).toBeTruthy();
    }
  });

  it('gives fleet providers and owner operators the same owner role', () => {
    expect(ORG_TYPE_TO_BOOTSTRAP_ROLE.fleet_provider).toBe(Role.OWNER_OPERATOR);
    expect(ORG_TYPE_TO_BOOTSTRAP_ROLE.owner_operator).toBe(Role.OWNER_OPERATOR);
  });
});
