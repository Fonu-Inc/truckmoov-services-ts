import { describe, expect, it } from 'vitest';
import { GetSystemBundleAdoptionUseCase } from '../../../apps/auth/src/get-system-bundle-adoption.use-case';

const token = { resolveAccessToken: () => ({ id: 'admin' }) };
const users = { findById: async () => ({ id: 'admin', email: 'admin@system', passwordHash: 'x', role: 'SYSTEM_ADMIN', tenantId: 'system', accountStatus: 'enabled' }) };
const date = new Date('2026-08-31T00:00:00.000Z');

describe('GetSystemBundleAdoptionUseCase', () => {
  it('aggregates tenant adoption and nested line details across tenants', async () => {
    const useCase = new GetSystemBundleAdoptionUseCase(token as never, users as never,
      { findAll: async () => [{ tenantId: 'tenant-a', company: { companyName: 'Acme' } }] } as never,
      { findAll: async () => ({ items: [{ id: 'sim-1', tenantId: 'tenant-a', msisdn: '2348000000001', iccid: 'iccid-1', vehicleId: 'vehicle-1', carrier: 'MTN' }], total: 1 }) } as never,
      { findAll: async () => ({ items: [{ tenantId: 'tenant-a', mobileNumber: '2348000000001', bundleId: 'bundle-1', status: 'active', dataUsedMb: 100, dataTotalMb: 1000 }], total: 1 }) } as never,
      { findAll: async () => ({ items: [{ id: 'bundle-1', name: 'MTN 1GB', carrierId: 'MTN', priceKobo: 150000, billingCycle: 'monthly' }], total: 1 }) } as never);

    const result = await useCase.execute('token');
    expect(result.data.total).toBe(1);
    expect(result.data.items[0]).toMatchObject({ tenantName: 'Acme', simCount: 1, activeBundleCount: 1, carriers: ['MTN'], monthlySpendNgn: 1500 });
    expect(result.data.items[0]?.lines[0]).toMatchObject({ iccid: 'iccid-1', vehicleId: 'vehicle-1', bundleName: 'MTN 1GB' });
  });

  describe('line detail, bundle type and summary', () => {
    const now = new Date('2026-09-01T00:00:00.000Z');
    const day = 86_400_000;
    const allocation = (id: string, bundleId: string, status: string, bought: number, expiresInDays: number | null) => ({
      id, tenantId: 'tenant-a', mobileNumber: '2348000000001', bundleId, status, dataUsedMb: 0, dataTotalMb: 1000,
      activatedAt: new Date(now.getTime() - bought * day), createdAt: new Date(now.getTime() - bought * day),
      expiresAt: expiresInDays === null ? null : new Date(now.getTime() + expiresInDays * day),
    });
    const build = () => new GetSystemBundleAdoptionUseCase(token as never, users as never,
      { findAll: async () => [{ tenantId: 'tenant-a', company: { companyName: 'Acme' } }, { tenantId: 'tenant-b', company: { companyName: 'Beta' } }] } as never,
      { findAll: async () => ({ items: [{ id: 's1', tenantId: 'tenant-a', msisdn: '2348000000001', iccid: 'iccid-1', vehicleId: 'v1', carrier: 'MTN' }, { id: 's2', tenantId: 'tenant-b', msisdn: '2348000000002', iccid: 'iccid-2', vehicleId: null, carrier: 'MTN' }], total: 2 }) } as never,
      { findAll: async () => ({ items: [
        allocation('a1', 'big', 'active', 20, 10),
        allocation('a2', 'small', 'active', 5, 5),
        allocation('a3', 'small', 'expired', 60, null),
        { ...allocation('a4', 'big', 'active', 3, 30), tenantId: 'tenant-b', mobileNumber: '2348000000002' },
      ], total: 4 }) } as never,
      { findAll: async () => ({ items: [
        { id: 'big', name: 'MTN 10GB', carrierId: 'MTN', priceKobo: 950000, billingCycle: 'monthly', active: true },
        { id: 'small', name: 'MTN 1GB', carrierId: 'MTN', priceKobo: 150000, billingCycle: 'monthly', active: true },
        { id: 'old', name: 'Retired', carrierId: 'MTN', priceKobo: 1, billingCycle: 'monthly', active: false },
      ], total: 3 }) } as never);

    it('tells the first live bundle on a line from the top-ups added after it, with price and days left', async () => {
      const acme = (await build().execute('token', {}, now)).data.items.find((r) => r.tenantId === 'tenant-a')!;
      const byId = Object.fromEntries(acme.lines.map((l) => [l.bundleId + String(l.status), l]));
      expect(byId['bigactive']).toMatchObject({ kind: 'subscription', priceNgn: 9500 });
      expect(byId['smallactive']).toMatchObject({ kind: 'top_up', priceNgn: 1500 });
      expect(byId['smallexpired']).toMatchObject({ kind: null, expiresInDays: null });
      expect(acme.lines.find((l) => l.bundleId === 'small' && l.status === 'active')?.expiresInDays).toBe(5);
    });

    it('counts only live bundles toward monthly spend', async () => {
      const acme = (await build().execute('token')).data.items.find((r) => r.tenantId === 'tenant-a')!;
      expect(acme.activeBundleCount).toBe(2);
      expect(acme.monthlySpendNgn).toBe(11000);
    });

    it('lists only tenants with a bundle of the chosen type', async () => {
      const topUps = await build().execute('token', { bundleType: 'top_up' });
      expect(topUps.data.items.map((r) => r.tenantName)).toEqual(['Acme']);
      const subscriptions = await build().execute('token', { bundleType: 'subscription' });
      expect(subscriptions.data.items.map((r) => r.tenantName)).toEqual(['Acme', 'Beta']);
    });

    it('summarises the four figures above the tables', async () => {
      const { data } = await build().summary('token', now);
      expect(data).toEqual({ totalActiveBundles: 2, expiringIn7Days: 1, simsAcrossTenants: 2, monthlyBundleSpendNgn: 20500 });
    });
  });

  it('requires a system actor', async () => {
    const useCase = new GetSystemBundleAdoptionUseCase(token as never,
      { findById: async () => ({ id: 'admin', email: 'a', passwordHash: 'x', role: 'ADMIN', tenantId: 'tenant-a', accountStatus: 'enabled' }) } as never,
      {} as never, {} as never, {} as never, {} as never);
    await expect(useCase.execute('token')).rejects.toThrow();
  });
});
