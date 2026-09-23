import { describe, expect, it, vi } from 'vitest';
import { AccessChangeNotifier, AccessResolver } from '../../../apps/auth/src/access-resolver';
import { AccessNotifyingUserRepository } from '../../../apps/auth/src/access-notifying-user.repository';
import { InMemoryPermissionRemovalRepository } from '../../../apps/auth/src/in-memory-permission-removal.repository';
import { InMemoryTenantRoleRepository } from '../../../apps/auth/src/in-memory-tenant-role.repository';
import { InMemoryUserRepository } from '../../../apps/auth/src/contexts/auth/session/infrastructure/in-memory-user.repository';

async function users(...seed: Array<{ id: string; role: string; tenantId: string; accountStatus?: 'enabled' | 'disabled' }>) {
  const repo = new InMemoryUserRepository();
  for (const u of seed) await repo.save({ ...u, email: `${u.id}@co.com`, passwordHash: 'x' });
  return repo;
}

describe('resolving what a user may do', () => {
  it('gives a tenant role its bundle in the tenant portal', async () => {
    const access = await new AccessResolver(new InMemoryTenantRoleRepository(), new InMemoryPermissionRemovalRepository()).resolve(await users({ id: 'u1', role: 'DISPATCHER', tenantId: 't1' }), 'u1');

    expect(access).toMatchObject({ portal: 'tenant', tenantId: 't1', active: true });
    expect(access?.permissions).toContain('tenant.dispatch.manage');
    expect(access?.permissions).not.toContain('tenant.organization.manage');
  });

  it('gives a system role held inside a tenant nothing', async () => {
    const access = await new AccessResolver(new InMemoryTenantRoleRepository(), new InMemoryPermissionRemovalRepository()).resolve(await users({ id: 'u1', role: 'PLATFORM_ADMIN', tenantId: 't1' }), 'u1');

    expect(access).toMatchObject({ portal: 'tenant', permissions: [] });
  });

  it('marks a disabled account inactive and knows nothing of a deleted one', async () => {
    const repo = await users({ id: 'u1', role: 'FLEET_ADMIN', tenantId: 't1', accountStatus: 'disabled' });
    const resolver = new AccessResolver(new InMemoryTenantRoleRepository(), new InMemoryPermissionRemovalRepository());

    expect((await resolver.resolve(repo, 'u1'))?.active).toBe(false);
    expect(await resolver.resolve(repo, 'ghost')).toBeNull();
  });
});

describe('a change reaching every cache', () => {
  function wired(repo: InMemoryUserRepository) {
    const resolver = new AccessResolver(new InMemoryTenantRoleRepository(), new InMemoryPermissionRemovalRepository());
    const bus = { publish: vi.fn(async () => {}) };
    const notifier = new AccessChangeNotifier(resolver, bus as never);
    return { resolver, bus, repo: new AccessNotifyingUserRepository(repo, notifier) };
  }

  it('applies a role change on the next lookup and tells the other services', async () => {
    const { resolver, bus, repo } = wired(await users({ id: 'u1', role: 'DISPATCHER', tenantId: 't1' }));
    await resolver.resolve(repo, 'u1');

    await repo.updateRole('u1', 'FINANCE_VIEWER');

    expect((await resolver.resolve(repo, 'u1'))?.permissions).toContain('tenant.financials.read');
    expect(bus.publish).toHaveBeenCalledWith('tm.system.access.changed', expect.objectContaining({ data: { userId: 'u1' } }));
  });

  it('suspends at once', async () => {
    const { resolver, repo } = wired(await users({ id: 'u1', role: 'FLEET_ADMIN', tenantId: 't1' }));
    await resolver.resolve(repo, 'u1');

    await repo.updateAccountStatus('u1', 'disabled');

    expect((await resolver.resolve(repo, 'u1'))?.active).toBe(false);
  });
});
