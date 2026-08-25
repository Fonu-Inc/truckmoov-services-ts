import { describe, expect, it, vi } from 'vitest';
import { InMemoryPlatformAlertSettingsRepository } from '../../../apps/auth/src/in-memory-platform-alert-settings.repository';
import {
  AlertHasNoRecipientError,
  PlatformAlertSettingsUseCase,
  UnknownAlertChannelError,
  UnknownAlertTypeError,
} from '../../../apps/auth/src/platform-alert-settings.use-case';
import { shouldRaise } from '../../../apps/auth/src/platform-alert-settings.repository';
import { ForbiddenError } from '../../../apps/auth/src/contexts/auth/session';

function build(role = 'PLATFORM_ADMIN') {
  const repository = new InMemoryPlatformAlertSettingsRepository();
  const useCase = new PlatformAlertSettingsUseCase(
    { resolveAccessToken: () => ({ id: 'staff-1' }) } as never,
    {
      findById: vi.fn(async () => ({
        id: 'staff-1',
        email: 'staff@truckmoov.com',
        role,
        tenantId: 'system',
        accountStatus: 'enabled',
        passwordHash: 'x',
        profile: {},
      })),
    } as never,
    repository,
  );
  return { useCase, repository };
}

describe('who may configure platform alerts', () => {
  it('admits a platform admin', async () => {
    await expect(build('PLATFORM_ADMIN').useCase.list('token')).resolves.toHaveLength(4);
  });

  it('admits system roles', async () => {
    await expect(build('SUPER_ADMIN').useCase.list('token')).resolves.toHaveLength(4);
    await expect(build('SYSTEM_ADMIN').useCase.list('token')).resolves.toHaveLength(4);
  });

  // Platform-wide operational config, not a tenant's own settings.
  it('refuses every stakeholder role', async () => {
    for (const role of ['ENTERPRISE_ADMIN', 'FLEET_ADMIN', 'AGGREGATOR_ADMIN', 'OWNER_OPERATOR']) {
      await expect(build(role).useCase.list('token')).rejects.toBeInstanceOf(ForbiddenError);
    }
  });
});

describe('one store, four alert types', () => {
  it('returns a row per alert type on first load', async () => {
    const settings = await build().useCase.list('token');

    expect(settings.map((s) => s.alertType).sort()).toEqual([
      'billing_alerts',
      'new_tenant_signup',
      'security_alerts',
      'system_errors',
    ]);
  });

  it('updates one type without touching the others', async () => {
    const { useCase } = build();

    await useCase.update({
      accessToken: 'token',
      alertType: 'billing_alerts',
      recipients: ['finance@truckmoov.com'],
    });

    const settings = await useCase.list('token');
    expect(settings.find((s) => s.alertType === 'billing_alerts')?.recipients).toEqual([
      'finance@truckmoov.com',
    ]);
    expect(settings.find((s) => s.alertType === 'system_errors')?.recipients).toEqual([]);
  });

  it('refuses an alert type it does not know', async () => {
    await expect(
      build().useCase.update({ accessToken: 'token', alertType: 'made_up' }),
    ).rejects.toBeInstanceOf(UnknownAlertTypeError);
  });

  it('refuses a channel it cannot deliver on', async () => {
    await expect(
      build().useCase.update({
        accessToken: 'token',
        alertType: 'system_errors',
        recipients: ['a@b.com'],
        channels: ['carrier-pigeon'],
      }),
    ).rejects.toBeInstanceOf(UnknownAlertChannelError);
  });

  it('records who changed it', async () => {
    const setting = await build().useCase.update({
      accessToken: 'token',
      alertType: 'system_errors',
      recipients: ['ops@truckmoov.com'],
    });

    expect(setting.updatedBy).toBe('staff-1');
  });
});

describe('an alert with no recipient goes nowhere', () => {
  it('refuses to enable one with an empty recipient list', async () => {
    await expect(
      build().useCase.update({ accessToken: 'token', alertType: 'system_errors', enabled: true, recipients: [] }),
    ).rejects.toBeInstanceOf(AlertHasNoRecipientError);
  });

  it('refuses when the seeded list is still empty', async () => {
    await expect(
      build().useCase.update({ accessToken: 'token', alertType: 'system_errors', enabled: true }),
    ).rejects.toBeInstanceOf(AlertHasNoRecipientError);
  });

  it('allows disabling one that has no recipients', async () => {
    await expect(
      build().useCase.update({ accessToken: 'token', alertType: 'system_errors', enabled: false }),
    ).resolves.toMatchObject({ enabled: false });
  });

  it('deduplicates and normalises recipients', async () => {
    const setting = await build().useCase.update({
      accessToken: 'token',
      alertType: 'system_errors',
      recipients: ['Ops@Truckmoov.com', ' ops@truckmoov.com ', ''],
    });

    expect(setting.recipients).toEqual(['ops@truckmoov.com']);
  });
});

describe('severity filters within an alert type', () => {
  const base = {
    alertType: 'security_alerts' as const,
    enabled: true,
    channels: ['email' as const],
    recipients: ['sec@truckmoov.com'],
    minSeverity: 'high' as const,
    updatedAt: '2026-08-24T10:00:00.000Z',
    updatedBy: null,
  };

  it('raises at or above the configured severity', () => {
    expect(shouldRaise(base, 'high').raise).toBe(true);
    expect(shouldRaise(base, 'critical').raise).toBe(true);
  });

  it('stays quiet below it', () => {
    expect(shouldRaise(base, 'medium')).toEqual({ raise: false, reason: 'below_severity' });
    expect(shouldRaise(base, 'low').raise).toBe(false);
  });

  it('stays quiet when the alert is off', () => {
    expect(shouldRaise({ ...base, enabled: false }, 'critical')).toEqual({
      raise: false,
      reason: 'disabled',
    });
  });

  it('reports an unroutable alert rather than counting it as sent', () => {
    expect(shouldRaise({ ...base, recipients: [] }, 'critical')).toEqual({
      raise: false,
      reason: 'no_recipients',
    });
  });
});
