import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError } from '../../../apps/auth/src/contexts/auth/session';
import { AccessChangeNotifier, AccessResolver } from '../../../apps/auth/src/access-resolver';
import { AccessNotifyingUserRepository } from '../../../apps/auth/src/access-notifying-user.repository';
import { InMemoryUserRepository } from '../../../apps/auth/src/contexts/auth/session/infrastructure/in-memory-user.repository';
import { InMemoryTenantRoleRepository } from '../../../apps/auth/src/in-memory-tenant-role.repository';
import { InMemoryPermissionRemovalRepository } from '../../../apps/auth/src/in-memory-permission-removal.repository';
import {
  InvalidTenantRoleError,
  SystemRolesUseCases,
  TenantRoleNotFoundError,
} from '../../../apps/auth/src/tenant-roles.use-cases';

async function harness() {
  const inner = new InMemoryUserRepository();
  const seed = [
    { id: 'root', role: 'SUPER_ADMIN', tenantId: 'system' },
    { id: 'ops', role: 'SYSTEM_ADMIN', tenantId: 'system' },
    { id: 'support', role: 'PLATFORM_ADMIN', tenantId: 'system' },
    { id: 'fitter', role: 'INSTALLER', tenantId: 'system' },
    { id: 'owner', role: 'OWNER_OPERATOR', tenantId: 't1' },
  ];
  for (const u of seed) await inner.save({ ...u, email: `${u.id}@truckmoov.com`, passwordHash: 'x' });
  const tenantRoles = new InMemoryTenantRoleRepository();
  const resolver = new AccessResolver(tenantRoles, new InMemoryPermissionRemovalRepository());
  const bus = { publish: vi.fn(async () => {}) };
  const users = new AccessNotifyingUserRepository(inner, new AccessChangeNotifier(resolver, bus as never));
  const tokens = {
    resolveAccessToken: (token: string) => {
      const u = seed.find((s) => s.id === token);
      return u ? { ...u, email: `${u.id}@truckmoov.com` } : null;
    },
  };
  const roles = new SystemRolesUseCases(
    tenantRoles, users, tokens as never, resolver,
    new AccessChangeNotifier(resolver, bus as never), { record: vi.fn(async () => ({})) } as never,
  );
  return { roles, resolver, users, tenantRoles };
}

describe('custom staff roles', () => {
  let h: Awaited<ReturnType<typeof harness>>;
  beforeEach(async () => {
    h = await harness();
  });

  it('lists the predefined staff roles', async () => {
    const { predefined } = await h.roles.list('root');
    expect(predefined.map((r) => r.role)).toEqual(['SUPER_ADMIN', 'SYSTEM_ADMIN', 'PLATFORM_ADMIN', 'GOVERNANCE_OFFICER']);
  });

  it('gives a staff member exactly the role\'s admin permissions', async () => {
    const role = await h.roles.create('root', { name: 'Billing desk', permissions: ['admin.billing.read', 'admin.billing.manage'] });
    await h.roles.assign('root', 'support', role.id);

    const access = await h.resolver.resolve(h.users, 'support');
    expect(access?.permissions.sort()).toEqual(['admin.billing.manage', 'admin.billing.read']);
  });

  it('holds only admin-portal permissions', async () => {
    await expect(h.roles.create('root', { name: 'Fleet', permissions: ['tenant.fuel.read'] })).rejects.toBeInstanceOf(
      InvalidTenantRoleError,
    );
  });

  it('refuses tenant users and installers as holders', async () => {
    const role = await h.roles.create('root', { name: 'Billing desk', permissions: ['admin.billing.read'] });
    await expect(h.roles.assign('root', 'fitter', role.id)).rejects.toBeInstanceOf(TenantRoleNotFoundError);
    await expect(h.roles.assign('root', 'owner', role.id)).rejects.toBeInstanceOf(TenantRoleNotFoundError);
  });

  it('is refused to a tenant-portal caller', async () => {
    await expect(h.roles.list('owner')).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('personal staff permissions', () => {
  let h: Awaited<ReturnType<typeof harness>>;
  beforeEach(async () => {
    h = await harness();
  });

  it('become the person\'s permissions, hidden from the role list', async () => {
    await h.roles.setPersonalPermissions('root', 'support', ['admin.billing.read', 'admin.support.read']);

    const access = await h.resolver.resolve(h.users, 'support');
    expect(access?.permissions.sort()).toEqual(['admin.billing.read', 'admin.support.read']);
    const listed = await h.roles.list('root');
    expect(listed.custom).toEqual([]);
    expect(listed.personal).toEqual([expect.objectContaining({ userId: 'support' })]);
  });

  it('update in place on a second change', async () => {
    const first = await h.roles.setPersonalPermissions('root', 'support', ['admin.billing.read']);
    const second = await h.roles.setPersonalPermissions('root', 'support', ['admin.support.read']);

    expect(second.customRoleId).toBe(first.customRoleId);
    expect((await h.resolver.resolve(h.users, 'support'))?.permissions).toEqual(['admin.support.read']);
  });

  it('return the person to their predefined role when emptied', async () => {
    await h.roles.setPersonalPermissions('root', 'support', ['admin.billing.read']);
    const result = await h.roles.setPersonalPermissions('root', 'support', []);

    expect(result.customRoleId).toBeNull();
    expect((await h.users.findById('support'))?.customRoleId ?? null).toBeNull();
    expect((await h.tenantRoles.listByTenant('system')).length).toBe(0);
  });

  it('cannot grant what the changer lacks, or change their own', async () => {
    await expect(h.roles.setPersonalPermissions('ops', 'support', ['admin.staff.manage'])).rejects.toBeInstanceOf(ForbiddenError);
    await expect(h.roles.setPersonalPermissions('root', 'root', ['admin.billing.read'])).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cannot be given to anyone else or edited as a shared role', async () => {
    const { customRoleId } = await h.roles.setPersonalPermissions('root', 'support', ['admin.billing.read']);

    await expect(h.roles.assign('root', 'ops', customRoleId)).rejects.toBeInstanceOf(TenantRoleNotFoundError);
    await expect(
      h.roles.update('root', customRoleId!, { name: 'Renamed', permissions: ['admin.billing.read'] }),
    ).rejects.toBeInstanceOf(TenantRoleNotFoundError);
  });

  it('reserves the personal prefix', async () => {
    await expect(
      h.roles.create('root', { name: 'personal:someone', permissions: ['admin.billing.read'] }),
    ).rejects.toBeInstanceOf(InvalidTenantRoleError);
  });
});
