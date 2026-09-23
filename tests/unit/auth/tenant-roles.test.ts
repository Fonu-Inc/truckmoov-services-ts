import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError } from '../../../apps/auth/src/contexts/auth/session';
import { AccessChangeNotifier, AccessResolver } from '../../../apps/auth/src/access-resolver';
import { AccessNotifyingUserRepository } from '../../../apps/auth/src/access-notifying-user.repository';
import { InMemoryUserRepository } from '../../../apps/auth/src/contexts/auth/session/infrastructure/in-memory-user.repository';
import { InMemoryTenantRoleRepository } from '../../../apps/auth/src/in-memory-tenant-role.repository';
import {
  InvalidTenantRoleError,
  TenantRoleInUseError,
  TenantRoleNameTakenError,
  TenantRolesUseCases,
} from '../../../apps/auth/src/tenant-roles.use-cases';
import { AccessGrantCheck } from '../../../apps/auth/src/access-grant-check';

async function harness() {
  const inner = new InMemoryUserRepository();
  const seed = [
    { id: 'owner', role: 'FLEET_ADMIN', tenantId: 't1' },
    { id: 'ops', role: 'OPERATIONS_MANAGER', tenantId: 't1' },
    { id: 'driver-desk', role: 'DISPATCHER', tenantId: 't1' },
    { id: 'outsider', role: 'DISPATCHER', tenantId: 't2' },
  ];
  for (const u of seed) await inner.save({ ...u, email: `${u.id}@co.com`, passwordHash: 'x' });
  const tenantRoles = new InMemoryTenantRoleRepository();
  const resolver = new AccessResolver(tenantRoles);
  const bus = { publish: vi.fn(async () => {}) };
  const users = new AccessNotifyingUserRepository(inner, new AccessChangeNotifier(resolver, bus as never));
  const activity = { record: vi.fn(async () => ({})) };
  const tokens = {
    resolveAccessToken: (token: string) => {
      const u = seed.find((s) => s.id === token);
      return u ? { ...u, email: `${u.id}@co.com` } : null;
    },
  };
  const roles = new TenantRolesUseCases(tenantRoles, users, tokens as never, resolver, new AccessChangeNotifier(resolver, bus as never), activity as never);
  return { roles, resolver, users, activity, bus, grants: new AccessGrantCheck(resolver, users) };
}

describe('custom roles', () => {
  let h: Awaited<ReturnType<typeof harness>>;
  beforeEach(async () => {
    h = await harness();
  });

  it('gives its holder exactly its permissions, replacing the predefined role', async () => {
    const role = await h.roles.create('owner', { name: 'Fuel desk', permissions: ['tenant.fuel.read', 'tenant.fuel.manage'] });

    await h.roles.assign('owner', 'driver-desk', role.id);

    const access = await h.resolver.resolve(h.users, 'driver-desk');
    expect(access?.permissions.sort()).toEqual(['tenant.fuel.manage', 'tenant.fuel.read']);
  });

  it('holds only tenant-portal permissions', async () => {
    await expect(h.roles.create('owner', { name: 'Sneaky', permissions: ['admin.tenants.manage'] })).rejects.toBeInstanceOf(
      InvalidTenantRoleError,
    );
    await expect(h.roles.create('owner', { name: 'Typo', permissions: ['tenant.nothing.read'] })).rejects.toBeInstanceOf(
      InvalidTenantRoleError,
    );
  });

  it('cannot be built broader than its builder', async () => {
    await expect(
      h.roles.create('ops', { name: 'Treasurer', permissions: ['tenant.wallet.manage'] }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cannot be given by someone who lacks what it grants', async () => {
    const wide = await h.roles.create('owner', { name: 'Wide', permissions: ['tenant.organization.manage'] });

    await expect(h.roles.assign('ops', 'driver-desk', wide.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('reaches every holder the moment it changes', async () => {
    const role = await h.roles.create('owner', { name: 'Fuel desk', permissions: ['tenant.fuel.read'] });
    await h.roles.assign('owner', 'driver-desk', role.id);
    await h.resolver.resolve(h.users, 'driver-desk');

    await h.roles.update('owner', role.id, { name: 'Fuel desk', permissions: ['tenant.fuel.read', 'tenant.fuel.manage'] });

    expect((await h.resolver.resolve(h.users, 'driver-desk'))?.permissions).toContain('tenant.fuel.manage');
  });

  it('stays inside its tenant', async () => {
    const role = await h.roles.create('owner', { name: 'Fuel desk', permissions: ['tenant.fuel.read'] });

    await expect(h.roles.assign('owner', 'outsider', role.id)).rejects.toThrow('User not found');
  });

  it('cannot be deleted while someone holds it, and names are unique', async () => {
    const role = await h.roles.create('owner', { name: 'Fuel desk', permissions: ['tenant.fuel.read'] });
    await h.roles.assign('owner', 'driver-desk', role.id);

    await expect(h.roles.remove('owner', role.id)).rejects.toBeInstanceOf(TenantRoleInUseError);
    await expect(h.roles.create('owner', { name: 'fuel DESK', permissions: ['tenant.fuel.read'] })).rejects.toBeInstanceOf(
      TenantRoleNameTakenError,
    );
  });

  it('records every change', async () => {
    const role = await h.roles.create('owner', { name: 'Fuel desk', permissions: ['tenant.fuel.read'] });
    await h.roles.assign('owner', 'driver-desk', role.id);

    const actions = h.activity.record.mock.calls.map(([c]) => (c as { action: string }).action);
    expect(actions).toEqual(['tenant_role.created', 'tenant_role.assigned']);
  });

  it('lists predefined roles as not editable', async () => {
    const { predefined } = await h.roles.list('owner');
    expect(predefined.every((r) => r.editable === false)).toBe(true);
  });
});

describe('giving predefined roles', () => {
  it('needs the giver to hold everything the role carries', async () => {
    const { grants } = await harness();

    expect(await grants.mayGrantRole('owner', 'DISPATCHER')).toBe(true);
    expect(await grants.mayGrantRole('ops', 'FLEET_ADMIN')).toBe(false);
  });
});
