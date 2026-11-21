import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryBundleCarrierRepository } from '../../../apps/auth/src/in-memory-bundle-carrier.repository';
import { InMemoryBundleCatalogRepository } from '../../../apps/auth/src/in-memory-bundle-catalog.repository';
import { MtnBundleCatalogSyncService } from '../../../apps/auth/src/contexts/mtn/mtn-bundle-catalog-sync.service';
import type { MtnProduct } from '../../../apps/auth/src/contexts/mtn/mtn-m2m.client';
import type { StoredBundleCatalog } from '../../../apps/auth/src/bundle-catalog.repository';

const NOW = new Date('2026-11-21T10:00:00.000Z');

function product(id: string, amount: number): MtnProduct {
  return {
    id,
    name: `M2M ${id}GB Monthly`,
    currency: 'NGN',
    amount,
    bundleCategory: 'Data',
    bundleType: 'DataBundle',
    bundleValidity: '30 Days',
    bundleValue: { value: Number(id), units: 'GB' },
    group: 'data',
    frequency: 'monthly',
  };
}

function bundle(overrides: Partial<StoredBundleCatalog> = {}): StoredBundleCatalog {
  return {
    id: 'bundle-mtn-m2m-1',
    code: 'MTN-M2M-1',
    name: '1GB Monthly',
    carrierId: 'carrier-mtn',
    dataAmountGb: 1,
    validityDays: 30,
    billingCycle: 'monthly',
    priceKobo: 50000,
    currency: 'NGN',
    active: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function harness(products: MtnProduct[]) {
  const mtn = { listProducts: vi.fn(async () => products) };
  const carriers = new InMemoryBundleCarrierRepository();
  const bundles = new InMemoryBundleCatalogRepository();
  const config = { mtn: { productMatch: 'm2m|machine' } };
  const sync = new MtnBundleCatalogSyncService(
    mtn as never,
    carriers,
    bundles,
    config as never,
  );
  return { mtn, carriers, bundles, sync };
}

describe('MTN bundle catalogue sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates the MTN carrier and upserts product prices', async () => {
    const h = harness([product('1', 600), product('2', 500)]);
    await h.bundles.save(bundle());
    await h.bundles.save(bundle({
      id: 'bundle-mtn-m2m-9',
      code: 'MTN-M2M-9',
      name: '9GB Monthly',
      dataAmountGb: 9,
    }));
    await h.bundles.save(bundle({
      id: 'bundle-custom',
      code: 'CUSTOM',
      carrierId: 'carrier-mtn',
      name: 'Manual bundle',
    }));

    const summary = await h.sync.sync(NOW);

    expect(summary).toEqual({
      fetched: 2,
      created: 1,
      updated: 1,
      deactivated: 1,
      skipped: 0,
    });
    expect((await h.carriers.findById('carrier-mtn'))?.name).toBe('MTN');

    const one = await h.bundles.findById('bundle-mtn-m2m-1');
    expect(one).toMatchObject({
      name: 'M2M 1GB Monthly',
      priceKobo: 60000,
      active: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: NOW,
    });

    const two = await h.bundles.findById('bundle-mtn-m2m-2');
    expect(two).toMatchObject({
      code: 'MTN-M2M-2',
      priceKobo: 50000,
      createdAt: NOW,
      active: true,
    });

    expect((await h.bundles.findById('bundle-mtn-m2m-9'))?.active).toBe(false);
    expect((await h.bundles.findById('bundle-custom'))?.active).toBe(true);
  });

  it('does not prune the catalogue when MTN returns no products', async () => {
    const h = harness([]);
    await h.bundles.save(bundle());

    const summary = await h.sync.sync(NOW);

    expect(summary.deactivated).toBe(0);
    expect((await h.bundles.findById('bundle-mtn-m2m-1'))?.active).toBe(true);
  });

  it('skips voice and consumer products that are not M2M bundles', async () => {
    const h = harness([
      { ...product('1', 500), group: 'voice', bundleType: 'Voice' },
      product('2', 500),
      {
        ...product('3', 500),
        name: '1GB Monthly',
        bundleCategory: 'DataPlan',
        subCategory: 'IDB1500',
        description: 'Consumer data bundle',
      },
    ]);

    const summary = await h.sync.sync(NOW);

    expect(summary.skipped).toBe(2);
    expect(summary.created).toBe(1);
    expect(await h.bundles.findById('bundle-mtn-m2m-1')).toBeNull();
    expect(await h.bundles.findById('bundle-mtn-m2m-3')).toBeNull();
  });
});
