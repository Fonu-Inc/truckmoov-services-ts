import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessChangeNotifier, AccessResolver } from '../../../apps/auth/src/access-resolver';
import { AccessNotifyingUserRepository } from '../../../apps/auth/src/access-notifying-user.repository';
import { InMemoryTenantRoleRepository } from '../../../apps/auth/src/in-memory-tenant-role.repository';
import { InMemoryPermissionRemovalRepository } from '../../../apps/auth/src/in-memory-permission-removal.repository';
import { EmailTakenError, ForbiddenError, InviteNotFoundError } from '../../../apps/auth/src/contexts/auth/session';
import { AuthUser } from '../../../apps/auth/src/contexts/auth/session/domain/entities/auth-user.entity';
import { LoginUseCase } from '../../../apps/auth/src/contexts/auth/session/application/use-cases/login.use-case';
import { RegisterInvitedUseCase } from '../../../apps/auth/src/contexts/auth/session/application/use-cases/register-invited.use-case';
import { InMemoryInviteRepository } from '../../../apps/auth/src/contexts/auth/session/infrastructure/in-memory-invite.repository';
import { InMemorySessionStore } from '../../../apps/auth/src/contexts/auth/session/infrastructure/in-memory-session.store';
import { InMemoryUserRepository } from '../../../apps/auth/src/contexts/auth/session/infrastructure/in-memory-user.repository';
import {
  InMemoryInstallationOrderRepository,
  InMemoryInstallerRepository,
} from '../../../apps/auth/src/contexts/installation/infrastructure/persistence/in-memory-installation.repositories';
import { InstallerAccountsAdapter } from '../../../apps/auth/src/contexts/installation/infrastructure/accounts/installer-accounts.adapter';
import { InstallerLoginUseCase } from '../../../apps/auth/src/contexts/installation/application/use-cases/installer-login.use-case';
import { ManageInstallersUseCases } from '../../../apps/auth/src/contexts/installation/application/use-cases/manage-installers.use-cases';
import { InstallerStateError } from '../../../apps/auth/src/contexts/installation/domain/installer';

const STAFF = [
  { id: 'platform', role: 'PLATFORM_ADMIN', tenantId: 'system' },
  { id: 'gov', role: 'GOVERNANCE_OFFICER', tenantId: 'system' },
];

const NEW_INSTALLER = {
  firstName: 'Tunde',
  lastName: 'Akinwale',
  email: 'Tunde@Example.com',
  phoneNumber: '08031234567',
  serviceAreas: ['lagos', 'Ogun'],
  capabilities: ['device_installation'],
};

class Ids {
  private n = 0;
  generate() {
    return `id-${++this.n}`;
  }
}

async function harness() {
  const inner = new InMemoryUserRepository();
  for (const s of STAFF) await inner.save({ ...s, email: `${s.id}@co.com`, passwordHash: 'x' });
  const resolver = new AccessResolver(new InMemoryTenantRoleRepository(), new InMemoryPermissionRemovalRepository());
  const bus = { publish: vi.fn(async () => {}) };
  const users = new AccessNotifyingUserRepository(inner, new AccessChangeNotifier(resolver, bus as never));
  const installers = new InMemoryInstallerRepository();
  const orders = new InMemoryInstallationOrderRepository();
  const invites = new InMemoryInviteRepository();
  const sessions = new InMemorySessionStore();
  const notifier = { sendInstallerInviteEmail: vi.fn(async () => {}) };
  const tokens = {
    resolveAccessToken: (t: string) => {
      const s = STAFF.find((x) => x.id === t);
      return s ? { ...s, email: `${s.id}@co.com` } : null;
    },
    issueAccessToken: (u: AuthUser) => `access:${u.id}`,
    issueRefreshToken: (u: AuthUser) => `refresh:${u.id}`,
  };
  const activity = { record: vi.fn(async () => ({})) };
  const ids = new Ids();
  const admin = new ManageInstallersUseCases(
    installers, orders, invites, users, sessions, notifier as never, ids, tokens as never, resolver, activity as never,
  );
  const register = new RegisterInvitedUseCase(
    users, invites, tokens as never, sessions, { hash: async (p: string) => `hashed:${p}` } as never, ids,
    new InstallerAccountsAdapter(installers),
  );
  return { admin, register, installers, orders, invites, sessions, notifier, users, bus, activity };
}

describe('platform admins managing installers', () => {
  let h: Awaited<ReturnType<typeof harness>>;
  beforeEach(async () => {
    h = await harness();
  });

  it('adds an installer as invited and sends the invite to the installer portal', async () => {
    const view = await h.admin.create('platform', NEW_INSTALLER);

    expect(view).toMatchObject({
      code: 'INS-0001',
      fullName: 'Tunde Akinwale',
      email: 'tunde@example.com',
      phoneNumber: '+2348031234567',
      serviceAreas: ['Lagos', 'Ogun'],
      status: 'invited',
      availability: 'not_onboarded',
      maxActiveJobs: 3,
    });
    expect(h.notifier.sendInstallerInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'tunde@example.com', role: 'INSTALLER' }),
    );
    expect(await h.invites.findByEmail('tunde@example.com')).toMatchObject({ role: 'INSTALLER', tenantId: 'system' });
    expect(h.activity.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'system.installer.created' }));
  });

  it('refuses an email already used by an installer or an account', async () => {
    await h.admin.create('platform', NEW_INSTALLER);
    await expect(h.admin.create('platform', NEW_INSTALLER)).rejects.toBeInstanceOf(EmailTakenError);
    await expect(h.admin.create('platform', { ...NEW_INSTALLER, email: 'gov@co.com' })).rejects.toBeInstanceOf(EmailTakenError);
  });

  it('is closed to staff without the installer permission', async () => {
    await expect(h.admin.list('gov', {})).rejects.toBeInstanceOf(ForbiddenError);
    await expect(h.admin.create('gov', NEW_INSTALLER)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('lists with counters, search, status filter and workload', async () => {
    const tunde = await h.admin.create('platform', NEW_INSTALLER);
    await h.admin.create('platform', { ...NEW_INSTALLER, firstName: 'Ada', email: 'ada@example.com', serviceAreas: ['FCT'] });
    await h.installers.save({ ...(await h.installers.findById(tunde.id))!, status: 'active', maxActiveJobs: 1 });
    await h.orders.save({ id: 'o1', installerId: tunde.id, status: 'assigned' } as never);
    await h.orders.save({ id: 'o2', installerId: tunde.id, status: 'completed' } as never);

    const all = await h.admin.list('platform', {});
    expect(all.summary).toEqual({ total: 2, active: 1, invited: 1, suspended: 0 });
    expect(all.items.find((i) => i.id === tunde.id)).toMatchObject({ activeJobs: 1, jobsCompleted: 1, availability: 'at_capacity' });

    expect((await h.admin.list('platform', { search: 'fct' })).items.map((i) => i.firstName)).toEqual(['Ada']);
    expect((await h.admin.list('platform', { search: 'INS-0001' })).total).toBe(1);
    expect((await h.admin.list('platform', { status: 'active' })).items.map((i) => i.id)).toEqual([tunde.id]);
  });

  it('shows an installer who set themselves unavailable as unavailable, even with room for work', async () => {
    const tunde = await h.admin.create('platform', NEW_INSTALLER);
    const stored = (await h.installers.findById(tunde.id))!;
    const work = { availability: 'unavailable', workingHours: { start: '08:00', end: '18:00' }, preferredPeriods: 'all_days' } as const;
    await h.installers.save({ ...stored, workPreferences: work });
    expect(await h.admin.get('platform', tunde.id)).toMatchObject({ status: 'invited', availability: 'not_onboarded' });

    await h.installers.save({ ...stored, status: 'active', workPreferences: work });
    expect(await h.admin.get('platform', tunde.id)).toMatchObject({ availability: 'unavailable' });

    await h.installers.save({ ...stored, status: 'active', workPreferences: { ...work, availability: 'available' } });
    expect(await h.admin.get('platform', tunde.id)).toMatchObject({ availability: 'available' });
  });

  it('suspends an active installer: account disabled, sessions ended, access change published', async () => {
    const view = await h.admin.create('platform', NEW_INSTALLER);
    const invite = (await h.invites.findByEmail('tunde@example.com'))!;
    const accepted = await h.register.execute({ inviteToken: invite.token, fullName: 'ignored', password: 'StrongPass123!' });
    h.bus.publish.mockClear();

    const suspended = await h.admin.suspend('platform', view.id);

    expect(suspended).toMatchObject({ status: 'suspended', availability: 'unavailable' });
    expect((await h.users.findById(accepted.user.id))?.accountStatus).toBe('disabled');
    expect(await h.sessions.getByRefreshToken(accepted.refreshToken)).toBeNull();
    expect(h.bus.publish).toHaveBeenCalled();

    expect(await h.admin.reactivate('platform', view.id)).toMatchObject({ status: 'active' });
    expect((await h.users.findById(accepted.user.id))?.accountStatus).toBe('enabled');
  });

  it('withdraws the invite of a suspended invitee and sends a fresh one on reactivation', async () => {
    const view = await h.admin.create('platform', NEW_INSTALLER);
    await h.admin.suspend('platform', view.id);
    expect(await h.invites.findByEmail('tunde@example.com')).toBeNull();

    expect(await h.admin.reactivate('platform', view.id)).toMatchObject({ status: 'invited' });
    expect(await h.invites.findByEmail('tunde@example.com')).not.toBeNull();
    expect(h.notifier.sendInstallerInviteEmail).toHaveBeenCalledTimes(2);
  });

  it('resends an invite only while the installer is invited, and only the newest link works', async () => {
    const view = await h.admin.create('platform', NEW_INSTALLER);
    const first = (await h.invites.findByEmail('tunde@example.com'))!.token;

    await h.admin.resendInvite('platform', view.id);

    expect(await h.invites.findByToken(first)).toBeNull();
    await h.admin.suspend('platform', view.id);
    await expect(h.admin.resendInvite('platform', view.id)).rejects.toBeInstanceOf(InstallerStateError);
  });

  it('edits details but keeps the email', async () => {
    const view = await h.admin.create('platform', NEW_INSTALLER);

    const edited = await h.admin.update('platform', view.id, { lastName: 'Bello', maxActiveJobs: 5 });

    expect(edited).toMatchObject({ fullName: 'Tunde Bello', maxActiveJobs: 5, email: 'tunde@example.com' });
  });
});

describe('accepting an installer invite', () => {
  it('creates the installer account in the system tenant and links the record', async () => {
    const h = await harness();
    const view = await h.admin.create('platform', NEW_INSTALLER);
    const invite = (await h.invites.findByEmail('tunde@example.com'))!;

    const result = await h.register.execute({ inviteToken: invite.token, fullName: 'Someone Else', password: 'StrongPass123!' });

    expect(result.user).toMatchObject({ role: 'INSTALLER', tenantId: 'system' });
    expect((await h.users.findById(result.user.id))?.profile?.fullName).toBe('Tunde Akinwale');
    expect(await h.installers.findById(view.id)).toMatchObject({ userId: result.user.id, status: 'active' });
  });

  it('refuses an installer invite with no installer waiting on it', async () => {
    const h = await harness();
    await h.invites.save({
      id: 'inv', email: 'x@example.com', role: 'INSTALLER', tenantId: 'system', token: 'tok',
      invitedBy: 'platform', status: 'pending', expiresAt: new Date(Date.now() + 60_000), createdAt: new Date(),
    });

    await expect(h.register.execute({ inviteToken: 'tok', fullName: 'X Y', password: 'StrongPass123!' })).rejects.toBeInstanceOf(
      InviteNotFoundError,
    );
  });

  it('refuses an installer invite naming a customer tenant', async () => {
    const h = await harness();
    await h.invites.save({
      id: 'inv', email: 'x@example.com', role: 'INSTALLER', tenantId: 't1', token: 'tok',
      invitedBy: 'owner', status: 'pending', expiresAt: new Date(Date.now() + 60_000), createdAt: new Date(),
    });

    await expect(h.register.execute({ inviteToken: 'tok', fullName: 'X Y', password: 'StrongPass123!' })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe('installer sign-in', () => {
  function signIn(role: string, tenantId: string, installers: InMemoryInstallerRepository) {
    const identity = { verifyCredentials: async (email: string) => AuthUser.create({ id: 'u1', email, role, tenantId }) };
    const tokens = { issueAccessToken: () => 'access', issueRefreshToken: () => 'refresh' };
    const login = new LoginUseCase(identity as never, tokens as never, new InMemorySessionStore());
    return new InstallerLoginUseCase(login, installers);
  }
  const credentials = { email: 'tunde@example.com', password: 'StrongPass123!' };

  async function installerWith(status: 'active' | 'suspended' | 'invited') {
    const installers = new InMemoryInstallerRepository();
    await installers.save({
      id: 'i1', userId: 'u1', code: 'INS-0001', firstName: 'Tunde', lastName: 'Akinwale', fullName: 'Tunde Akinwale',
      email: credentials.email, phoneNumber: '+2348031234567', team: '', state: null, city: null, serviceAreas: ['Lagos'],
      capabilities: [], photoKey: null, notificationPreferences: null, displayPreferences: null, workPreferences: null,
      status, maxActiveJobs: 3, lastActivityAt: null,
      createdAt: new Date(), updatedAt: new Date(),
    });
    return installers;
  }

  it('admits an active installer and records the activity', async () => {
    const installers = await installerWith('active');

    const session = await signIn('INSTALLER', 'system', installers).execute(credentials);

    expect(session.user.role).toBe('INSTALLER');
    expect((await installers.findById('i1'))?.lastActivityAt).not.toBeNull();
  });

  it('refuses a suspended installer whose account is still enabled', async () => {
    await expect(signIn('INSTALLER', 'system', await installerWith('suspended')).execute(credentials)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('refuses anyone who is not an installer in the system tenant', async () => {
    const installers = await installerWith('active');
    for (const [role, tenant] of [['INSTALLER', 't1'], ['PLATFORM_ADMIN', 'system'], ['FLEET_ADMIN', 't1']]) {
      await expect(signIn(role, tenant, installers).execute(credentials)).rejects.toBeInstanceOf(ForbiddenError);
    }
  });
});
