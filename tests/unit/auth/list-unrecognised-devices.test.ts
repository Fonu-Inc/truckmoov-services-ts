import { SYSTEM_TENANT_ID } from '@shared/identity';
import { describe, expect, it } from 'vitest';
import { ListUnrecognisedDevicesUseCase } from '../../../apps/auth/src/list-unrecognised-devices.use-case';

describe('ListUnrecognisedDevicesUseCase', () => {
  const staff = { id: 'u1', tenantId: SYSTEM_TENANT_ID, role: 'SUPER_ADMIN', accountStatus: 'active' };
  const tenantUser = { id: 'u2', tenantId: 'acme', role: 'TENANT_ADMIN', accountStatus: 'active' };
  const useCase = (devices: unknown, actor = staff) =>
    new ListUnrecognisedDevicesUseCase(
      { resolveAccessToken: () => ({ id: actor.id }) } as never,
      { findById: async () => actor } as never,
      { quarantinedDevices: async () => devices } as never,
    );

  it('reports trackingReachable=false with an empty list when tracking is down', async () => {
    const { data } = await useCase(null).execute('token');
    expect(data).toMatchObject({ trackingReachable: false, devices: [] });
  });

  it('returns the unrecognised devices tracking holds back', async () => {
    const devices = [{ imei: '359779090077777', firstSeenAt: '2026-02-02T10:00:00Z', lastSeenAt: '2026-02-02T11:00:00Z', messageCount: 12 }];
    const { data } = await useCase(devices).execute('token');
    expect(data.trackingReachable).toBe(true);
    expect(data.devices).toEqual(devices);
  });

  it('refuses anyone outside the system tenant', async () => {
    await expect(useCase([], tenantUser).execute('token')).rejects.toThrow();
  });
});
