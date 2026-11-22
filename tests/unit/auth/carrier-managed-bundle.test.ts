import { describe, expect, it } from 'vitest';
import { DeleteSystemBundleUseCase } from '../../../apps/auth/src/delete-system-bundle.use-case';
import { InMemoryBundleCatalogRepository } from '../../../apps/auth/src/in-memory-bundle-catalog.repository';
import { CarrierManagedBundleError, UpdateSystemBundleUseCase } from '../../../apps/auth/src/update-system-bundle.use-case';

const token = { resolveAccessToken: () => ({ id: 'admin' }) };
const users = { findById: async () => ({ id: 'admin', email: 'a@system', passwordHash: 'x', role: 'SYSTEM_ADMIN', tenantId: 'system', accountStatus: 'enabled' }) };
const now = new Date();
const bundle = (id: string, active: boolean) => ({
  id, code: id, name: id, carrierId: 'carrier-mtn', dataAmountGb: 1, validityDays: 30,
  billingCycle: 'monthly', priceKobo: 100000, currency: 'NGN', active, createdAt: now, updatedAt: now,
});

async function setup() {
  const repo = new InMemoryBundleCatalogRepository();
  await repo.save(bundle('bundle-mtn-m2m-42', false));
  await repo.save(bundle('MANUAL_1', false));
  return {
    repo,
    update: new UpdateSystemBundleUseCase(token as never, users as never, repo),
    remove: new DeleteSystemBundleUseCase(token as never, users as never, repo),
  };
}

describe('carrier-managed bundles', () => {
  it('refuses switching an MTN-synced bundle on or off', async () => {
    const { repo, update, remove } = await setup();
    await expect(update.execute('t', 'bundle-mtn-m2m-42', { active: true })).rejects.toBeInstanceOf(CarrierManagedBundleError);
    await expect(remove.execute('t', 'bundle-mtn-m2m-42')).rejects.toBeInstanceOf(CarrierManagedBundleError);
    expect((await repo.findById('bundle-mtn-m2m-42'))?.active).toBe(false);
  });

  it('still lets other edits through and leaves manual bundles switchable', async () => {
    const { repo, update } = await setup();
    await update.execute('t', 'bundle-mtn-m2m-42', { name: 'Renamed', active: false });
    await update.execute('t', 'MANUAL_1', { active: true });
    expect((await repo.findById('bundle-mtn-m2m-42'))?.name).toBe('Renamed');
    expect((await repo.findById('MANUAL_1'))?.active).toBe(true);
  });
});
