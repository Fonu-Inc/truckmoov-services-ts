import { SYSTEM_TENANT_ID } from '@shared/identity';
import { describe, expect, it } from 'vitest';
import {
  ListStillReportingDevicesUseCase,
  selectStillReporting,
  type DeviceFacts,
} from '../../../apps/auth/src/list-still-reporting-devices.use-case';
import type { GateBlockedDevice } from '../../../apps/auth/src/tracking-gate.client';

const blocked = (over: Partial<GateBlockedDevice>): GateBlockedDevice => ({
  deviceId: 'd1',
  imei: 'imei-1',
  tenantId: 't1',
  lastSeenAt: '2026-02-02T12:00:00.000Z',
  droppedToday: 4,
  droppedTotal: 9,
  blockedReason: 'tenant',
  ...over,
});

const facts = (over: Partial<DeviceFacts> = {}): DeviceFacts => ({
  id: 'd1',
  imei: 'imei-1',
  name: 'Truck 12 tracker',
  manufacturer: 'Teltonika',
  model: 'FMB920',
  tenantId: 't1',
  suspendedAt: null,
  ...over,
});

const base = (entries: GateBlockedDevice[], device = facts()) => ({
  blocked: entries,
  devicesByImei: new Map([[device.imei, device]]),
  tenantSuspendedAt: new Map([['t1', new Date('2026-02-01T00:00:00.000Z')]]),
  tenantNames: new Map([['t1', 'Acme Haulage']]),
});

describe('selectStillReporting', () => {
  it('joins names, company and suspension time', () => {
    const [row] = selectStillReporting(base([blocked({})]));
    expect(row).toMatchObject({
      deviceName: 'Truck 12 tracker',
      companyName: 'Acme Haulage',
      suspendedAt: '2026-02-01T00:00:00.000Z',
      droppedToday: 4,
      droppedTotal: 9,
    });
  });

  it('drops a device last seen before the suspension', () => {
    expect(selectStillReporting(base([blocked({ lastSeenAt: '2026-01-31T23:59:59.000Z' })]))).toEqual([]);
  });

  it('uses the device suspension time for a device block', () => {
    const device = facts({ suspendedAt: new Date('2026-02-02T13:00:00.000Z') });
    expect(selectStillReporting(base([blocked({ blockedReason: 'device' })], device))).toEqual([]);
  });

  it('falls back to the model, then the IMEI, when the device has no name', () => {
    const named = selectStillReporting(base([blocked({})], facts({ name: null })));
    expect(named[0].deviceName).toBe('Teltonika FMB920');
    const bare = selectStillReporting({ ...base([blocked({})]), devicesByImei: new Map() });
    expect(bare[0].deviceName).toBe('imei-1');
    expect(bare[0].companyName).toBe('Acme Haulage');
  });

  it('keeps a blocked device whose suspension time is unknown', () => {
    const input = { ...base([blocked({})]), tenantSuspendedAt: new Map<string, Date>() };
    expect(selectStillReporting(input)[0].suspendedAt).toBeNull();
  });

  it('lists the most recent first', () => {
    const rows = selectStillReporting(
      base([blocked({ imei: 'a', lastSeenAt: '2026-02-02T10:00:00.000Z' }), blocked({ imei: 'b' })]),
    );
    expect(rows.map((row) => row.imei)).toEqual(['b', 'a']);
  });
});

describe('ListStillReportingDevicesUseCase', () => {
  const staff = { id: 'u1', tenantId: SYSTEM_TENANT_ID, role: 'SUPER_ADMIN', accountStatus: 'active' };
  const useCase = (report: unknown) =>
    new ListStillReportingDevicesUseCase(
      { persistence: { backend: 'in-memory' } } as never,
      { resolveAccessToken: () => ({ id: 'u1' }) } as never,
      { findById: async () => staff } as never,
      { blockedDevices: async () => report } as never,
      { findAll: async () => [{ tenantId: 't1', suspendedAt: new Date('2026-02-01T00:00:00.000Z') }] } as never,
    );

  it('reports gateReachable=false with an empty list when the gate is down', async () => {
    const { data } = await useCase(null).execute('token');
    expect(data).toMatchObject({ gateReachable: false, devices: [] });
  });

  it('reports gateReachable=true and the joined list when the gate answers', async () => {
    const report = { countsSince: 'service_restart', startedAt: '2026-02-02T00:00:00Z', devices: [blocked({})] };
    const { data } = await useCase(report).execute('token');
    expect(data.gateReachable).toBe(true);
    expect(data.countsSince).toBe('service_restart');
    expect(data.devices).toHaveLength(1);
  });
});
