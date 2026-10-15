import { describe, expect, it, vi } from 'vitest';
import { RefreshUseCase } from '../../../apps/auth/src/contexts/auth/session/application/use-cases/refresh.use-case';
import { SessionExpiredError } from '../../../apps/auth/src/contexts/auth/session/domain/errors/session-expired.error';
import {
  buildDefaultSystemSettings,
  normalizeSystemSettings,
} from '../../../apps/auth/src/system-settings.repository';
import { ActivityLogService } from '../../../apps/auth/src/activity-log.service';

function sessionStore(lastActiveAt: Date | null) {
  return {
    getByRefreshToken: vi.fn(async () => ({ id: 'user-1' })),
    lastActiveAt: vi.fn(async () => lastActiveAt),
    deleteByRefreshToken: vi.fn(async () => {}),
    save: vi.fn(async () => {}),
    rotate: vi.fn(async () => true),
    isSpent: vi.fn(async () => false),
    revokeFamily: vi.fn(async () => {}),
  };
}

function tokens() {
  return { issueAccessToken: () => 'access', issueRefreshToken: () => 'refresh' };
}

function userRepo() {
  return {
    findById: async () => ({
      id: 'user-1',
      email: 'user@co.com',
      role: 'FLEET_ADMIN',
      tenantId: 'tenant-1',
      accountStatus: 'enabled',
      emailVerificationToken: null,
    }),
  };
}

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60_000);
}

describe('Session idle timeout', () => {
  it('renews a session used inside the window', async () => {
    const store = sessionStore(minutesAgo(5));
    const useCase = new RefreshUseCase(store as never, tokens() as never, userRepo() as never, {
      idleTimeoutMinutes: async () => 30,
    });

    await expect(useCase.execute('refresh-1')).resolves.toMatchObject({ accessToken: 'access' });
  });

  it('refuses one that has been idle longer than the timeout', async () => {
    const store = sessionStore(minutesAgo(45));
    const useCase = new RefreshUseCase(store as never, tokens() as never, userRepo() as never, {
      idleTimeoutMinutes: async () => 30,
    });

    await expect(useCase.execute('refresh-1')).rejects.toBeInstanceOf(SessionExpiredError);
  });

  // Refused is not enough: a token that has already timed out must not work on
  // a later attempt either.
  it('destroys the timed-out session rather than only refusing it', async () => {
    const store = sessionStore(minutesAgo(45));
    const useCase = new RefreshUseCase(store as never, tokens() as never, userRepo() as never, {
      idleTimeoutMinutes: async () => 30,
    });

    await expect(useCase.execute('refresh-1')).rejects.toThrow();
    expect(store.deleteByRefreshToken).toHaveBeenCalledWith('refresh-1');
  });

  it('imposes nothing when no timeout is configured', async () => {
    const store = sessionStore(minutesAgo(60 * 24));
    const useCase = new RefreshUseCase(store as never, tokens() as never, userRepo() as never, {
      idleTimeoutMinutes: async () => null,
    });

    await expect(useCase.execute('refresh-1')).resolves.toBeTruthy();
  });

  // A session with no recorded activity is not evidence of an idle one.
  it('lets a session with no recorded activity through', async () => {
    const store = sessionStore(null);
    const useCase = new RefreshUseCase(store as never, tokens() as never, userRepo() as never, {
      idleTimeoutMinutes: async () => 30,
    });

    await expect(useCase.execute('refresh-1')).resolves.toBeTruthy();
  });
});

describe('Security settings defaults', () => {
  // Enforcing two-factor on upgrade would lock out every administrator before
  // anybody has had the chance to enrol.
  it('does not require two-factor out of the box', () => {
    expect(buildDefaultSystemSettings().security.requireTwoFactor).toBe(false);
  });

  it('keeps audit logging on and the timeout at thirty minutes', () => {
    const { security } = buildDefaultSystemSettings();
    expect(security.auditLogging).toBe(true);
    expect(security.sessionTimeoutMinutes).toBe(30);
  });

  // A row written before the section existed must not read as two-factor
  // enforced.
  it('fills the section on a row that predates it', () => {
    const stored = { ...buildDefaultSystemSettings(), security: undefined } as never;
    const normalized = normalizeSystemSettings(stored);

    expect(normalized.security).toEqual({
      requireTwoFactor: false,
      sessionTimeoutMinutes: 30,
      auditLogging: true,
    });
  });
});

describe('Audit logging switch', () => {
  function build(auditLogging: boolean) {
    const save = vi.fn(async () => {});
    const service = new ActivityLogService(
      { save } as never,
      { get: async () => ({ security: { auditLogging } }) } as never,
      {} as never,
      {} as never,
    );
    return { service, save };
  }

  it('writes an entry while logging is on', async () => {
    const { service, save } = build(true);
    await service.record({
      tenantId: 'system',
      service: 'auth',
      action: 'system.tenant.suspended',
      entityType: 'tenant',
      entityId: 't1',
      summary: 'Tenant suspended',
    });
    expect(save).toHaveBeenCalledOnce();
  });

  it('writes nothing while logging is off', async () => {
    const { service, save } = build(false);
    await service.record({
      tenantId: 'system',
      service: 'auth',
      action: 'system.tenant.suspended',
      entityType: 'tenant',
      entityId: 't1',
      summary: 'Tenant suspended',
    });
    expect(save).not.toHaveBeenCalled();
  });

  // Switching the trail off is itself an administrative act. If that went
  // unrecorded, the trail could be closed with no evidence it ever happened.
  it('always records the change that switched logging off', async () => {
    const { service, save } = build(false);
    await service.record({
      tenantId: 'system',
      service: 'auth',
      action: 'system.settings.updated',
      entityType: 'system_settings',
      entityId: 'system',
      summary: 'System settings updated',
    });
    expect(save).toHaveBeenCalledOnce();
  });

  it('keeps logging when the settings cannot be read', async () => {
    const save = vi.fn(async () => {});
    const service = new ActivityLogService(
      { save } as never,
      {
        get: async () => {
          throw new Error('database unavailable');
        },
      } as never,
      {} as never,
      {} as never,
    );

    await service.record({
      tenantId: 'system',
      service: 'auth',
      action: 'system.tenant.suspended',
      entityType: 'tenant',
      entityId: 't1',
      summary: 'Tenant suspended',
    });
    expect(save).toHaveBeenCalledOnce();
  });
});

describe('Display preferences', () => {
  it('defaults the time range to the last seven days', () => {
    expect(buildDefaultSystemSettings().defaults.defaultTimeRange).toBe('last_7_days');
  });

  // A row written before the setting existed must still open a chart on
  // something sensible.
  it('fills the range on a row that predates it', () => {
    const stored = buildDefaultSystemSettings();
    delete (stored.defaults as Record<string, unknown>).defaultTimeRange;

    expect(normalizeSystemSettings(stored).defaults.defaultTimeRange).toBe('last_7_days');
  });

  it('ignores a range it does not offer rather than storing it', () => {
    const stored = buildDefaultSystemSettings();
    (stored.defaults as Record<string, unknown>).defaultTimeRange = 'last_decade';

    expect(normalizeSystemSettings(stored).defaults.defaultTimeRange).toBe('last_7_days');
  });
});

