import { describe, expect, it } from 'vitest';
import { BundleCodeTakenError, CreateSystemBundleUseCase } from '../../../apps/auth/src/create-system-bundle.use-case';
import { InMemoryBundleCatalogRepository } from '../../../apps/auth/src/in-memory-bundle-catalog.repository';

const token = { resolveAccessToken: () => ({ id: 'admin' }) };
const users = { findById: async () => ({ id: 'admin', email: 'a@system', passwordHash: 'x', role: 'SYSTEM_ADMIN', tenantId: 'system', accountStatus: 'enabled' }) };
const form = { code: 'MTN_7GB_M', name: 'MTN 7GB Monthly', dataAmountGb: 7, validityDays: 30, billingCycle: 'monthly', priceNaira: 7000 };

describe('CreateSystemBundleUseCase', () => {
  it('fills in what the form does not send: id from the code, MTN as carrier, live by default', async () => {
    const repo = new InMemoryBundleCatalogRepository();
    await new CreateSystemBundleUseCase(token as never, users as never, repo).execute('t', form);
    expect(await repo.findById('MTN_7GB_M')).toMatchObject({ code: 'MTN_7GB_M', carrierId: 'carrier-mtn', priceKobo: 700000, active: true });
  });

  it('keeps a bundle created switched off hidden from tenants', async () => {
    const repo = new InMemoryBundleCatalogRepository();
    await new CreateSystemBundleUseCase(token as never, users as never, repo).execute('t', { ...form, active: false });
    expect((await repo.findById('MTN_7GB_M'))?.active).toBe(false);
  });

  it('refuses a code that is taken instead of overwriting that bundle', async () => {
    const repo = new InMemoryBundleCatalogRepository();
    const useCase = new CreateSystemBundleUseCase(token as never, users as never, repo);
    await useCase.execute('t', form);
    await expect(useCase.execute('t', { ...form, name: 'Other', priceNaira: 1 })).rejects.toBeInstanceOf(BundleCodeTakenError);
    expect((await repo.findById('MTN_7GB_M'))?.name).toBe('MTN 7GB Monthly');
  });
});
