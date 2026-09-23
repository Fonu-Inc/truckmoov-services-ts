import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError } from '../../../apps/auth/src/contexts/auth/session';
import { AccessChangeNotifier, AccessResolver } from '../../../apps/auth/src/access-resolver';
import { AccessNotifyingUserRepository } from '../../../apps/auth/src/access-notifying-user.repository';
import { InMemoryUserRepository } from '../../../apps/auth/src/contexts/auth/session/infrastructure/in-memory-user.repository';
import { InMemoryTenantRoleRepository } from '../../../apps/auth/src/in-memory-tenant-role.repository';
import { InMemoryPermissionRemovalRepository } from '../../../apps/auth/src/in-memory-permission-removal.repository';
import {
  GovernanceUseCases,
  InvalidRemovalError,
  RemovalNotCancellableError,
} from '../../../apps/auth/src/governance.use-cases';

const NOW = new Date('2026-10-01T09:00:00Z');
const LATER = '2026-10-15T00:00:00Z';

async function harness() {
  const inner = new InMemoryUserRepository();
  const seed = [
    { id: 'gov', role: 'GOVERNANCE_OFFICER', tenantId: 'system' },
    { id: 'platform', role: 'PLATFORM_ADMIN', tenantId: 'system' },
    { id: 'super', role: 'SUPER_ADMIN', tenantId: 'system' },
    { id: 'sysadmin', role: 'SYSTEM_ADMIN', tenantId: 'system' },
    { id: 'owner', role: 'FLEET_ADMIN', tenantId: 't1' },
    { id: 'desk', role: 'DISPATCHER', tenantId: 't1' },
  ];
  for (const u of seed) await inner.save({ ...u, email: `${u.id}@co.com`, passwordHash: 'x' });
  const removals = new InMemoryPermissionRemovalRepository();
  const tenantRoles = new InMemoryTenantRoleRepository();
  const resolver = new AccessResolver(tenantRoles, removals);
  const bus = { publish: vi.fn(async () => {}) };
  const notifier = new AccessChangeNotifier(resolver, bus as never);
  const users = new AccessNotifyingUserRepository(inner, notifier);
  const tokens = { resolveAccessToken: (t: string) => seed.find((s) => s.id === t) && { ...seed.find((s) => s.id === t)!, email: `${t}@co.com` } };
  const activity = { record: vi.fn(async () => ({})) };
  const governance = new GovernanceUseCases(removals, tenantRoles, users, tokens as never, resolver, notifier, activity as never);
  return { governance, resolver, users, bus, activity };
}

describe('governance of tenant permissions', () => {
  let h: Awaited<ReturnType<typeof harness>>;
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    h = await harness();
  });
  afterEach(() => vi.useRealTimers());

  it('is closed to a platform admin without the governance permission', async () => {
    await expect(h.governance.review('platform', 't1')).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      h.governance.schedule('platform', { tenantId: 't1', permission: 'tenant.fuel.manage', effectiveAt: LATER, reason: 'x' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('shows each role, what it grants, and who holds it', async () => {
    const review = await h.governance.review('gov', 't1');

    const dispatcher = review.predefined.find((r) => r.role === 'DISPATCHER');
    expect(dispatcher?.holders.map((u) => u.userId)).toEqual(['desk']);
    expect(dispatcher?.permissions).toContain('tenant.dispatch.manage');
  });

  it('never removes at once, and only tenant permissions', async () => {
    const base = { tenantId: 't1', reason: 'plan change' };
    await expect(h.governance.schedule('gov', { ...base, permission: 'tenant.fuel.manage', effectiveAt: NOW.toISOString() })).rejects.toBeInstanceOf(InvalidRemovalError);
    await expect(h.governance.schedule('gov', { ...base, permission: 'admin.tenants.read', effectiveAt: LATER })).rejects.toBeInstanceOf(InvalidRemovalError);
  });

  it('keeps the permission until the effective time, then takes it from every role', async () => {
    await h.governance.schedule('gov', { tenantId: 't1', permission: 'tenant.fuel.manage', effectiveAt: LATER, reason: 'plan change' });
    expect((await h.resolver.resolve(h.users, 'desk'))?.permissions).toContain('tenant.fuel.manage');

    vi.setSystemTime(new Date(LATER));

    expect((await h.resolver.resolve(h.users, 'desk'))?.permissions).not.toContain('tenant.fuel.manage');
    expect((await h.resolver.resolve(h.users, 'owner'))?.permissions).not.toContain('tenant.fuel.manage');
  });

  it('can be cancelled until then, not after', async () => {
    const early = await h.governance.schedule('gov', { tenantId: 't1', permission: 'tenant.fuel.manage', effectiveAt: LATER, reason: 'r' });
    await h.governance.cancel('gov', early.id);
    vi.setSystemTime(new Date(LATER));
    expect((await h.resolver.resolve(h.users, 'desk'))?.permissions).toContain('tenant.fuel.manage');

    vi.setSystemTime(NOW);
    const late = await h.governance.schedule('gov', { tenantId: 't1', permission: 'tenant.fuel.read', effectiveAt: LATER, reason: 'r' });
    vi.setSystemTime(new Date(LATER));
    await expect(h.governance.cancel('gov', late.id)).rejects.toBeInstanceOf(RemovalNotCancellableError);
  });

  it('tells every service when a removal comes due', async () => {
    await h.governance.schedule('gov', { tenantId: 't1', permission: 'tenant.fuel.manage', effectiveAt: LATER, reason: 'r' });
    h.bus.publish.mockClear();
    vi.setSystemTime(new Date(LATER));

    expect(await h.governance.applyDue()).toBe(1);
    const told = h.bus.publish.mock.calls.map(([, e]) => (e as { data: { userId: string } }).data.userId).sort();
    expect(told).toEqual(['desk', 'owner']);
  });

  it('records every change', async () => {
    const removal = await h.governance.schedule('gov', { tenantId: 't1', permission: 'tenant.fuel.manage', effectiveAt: LATER, reason: 'r' });
    await h.governance.cancel('gov', removal.id);

    const actions = h.activity.record.mock.calls.map(([c]) => (c as { action: string }).action);
    expect(actions).toEqual(['permission_removal.scheduled', 'permission_removal.cancelled']);
  });
});

describe('staff roles', () => {
  it('are managed by governance officers and super admins, within what they hold', async () => {
    const h = await harness();

    await expect(h.governance.setStaffRole('gov', 'platform', 'GOVERNANCE_OFFICER')).resolves.toMatchObject({ role: 'GOVERNANCE_OFFICER' });
    await expect(h.governance.setStaffRole('super', 'platform', 'SYSTEM_ADMIN')).resolves.toMatchObject({ role: 'SYSTEM_ADMIN' });
    // A governance officer does not hold everything a super admin does.
    await expect(h.governance.setStaffRole('gov', 'platform', 'SUPER_ADMIN')).rejects.toBeInstanceOf(ForbiddenError);
    await expect(h.governance.setStaffRole('sysadmin', 'platform', 'PLATFORM_ADMIN')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('never apply to tenant users', async () => {
    const h = await harness();
    await expect(h.governance.setStaffRole('super', 'owner', 'SYSTEM_ADMIN')).rejects.toThrow('Staff member not found');
  });
});
