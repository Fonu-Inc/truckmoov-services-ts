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

  it('requires a system actor', async () => {
    const useCase = new GetSystemBundleAdoptionUseCase(token as never,
      { findById: async () => ({ id: 'admin', email: 'a', passwordHash: 'x', role: 'ADMIN', tenantId: 'tenant-a', accountStatus: 'enabled' }) } as never,
      {} as never, {} as never, {} as never, {} as never);
    await expect(useCase.execute('token')).rejects.toThrow();
  });
});
