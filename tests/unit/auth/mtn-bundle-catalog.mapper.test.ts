import { describe, expect, it } from 'vitest';
import type { MtnProduct } from '../../../apps/auth/src/contexts/mtn/mtn-m2m.client';
import {
  dataAmountInGb,
  mapMtnProduct,
  validityInDays,
} from '../../../apps/auth/src/contexts/mtn/mtn-bundle-catalog.mapper';

function product(overrides: Partial<MtnProduct> = {}): MtnProduct {
  return {
    id: '97',
    name: 'M2M 1GB Monthly',
    currency: 'NGN',
    amount: 500,
    bundleCategory: 'Data',
    bundleType: 'DataBundle',
    bundleValidity: '30 Days',
    bundleValue: { value: 1, units: 'GB' },
    group: 'data',
    frequency: 'monthly',
    ...overrides,
  };
}

describe('MTN bundle catalogue mapping', () => {
  it('maps a data bundle to the local catalogue shape', () => {
    expect(mapMtnProduct(product())).toEqual({
      id: 'bundle-mtn-m2m-97',
      code: 'MTN-M2M-97',
      name: 'M2M 1GB Monthly',
      carrierId: 'carrier-mtn',
      dataAmountGb: 1,
      validityDays: 30,
      billingCycle: 'monthly',
      priceKobo: 50_000,
      currency: 'NGN',
      active: true,
    });
  });

  it('converts MB values and parses validity from the name', () => {
    expect(dataAmountInGb(product({
      name: '500MB Weekly',
      bundleValue: { value: 500, units: 'MB' },
    }))).toBeCloseTo(0.49, 2);
    expect(validityInDays(product({
      bundleValidity: '7 Days',
      frequency: 'weekly',
    }))).toBe(7);
  });

  it('falls back to the frequency when validity text is absent', () => {
    expect(validityInDays(product({
      bundleValidity: undefined,
      frequency: 'daily',
    }))).toBe(1);
    expect(validityInDays(product({
      bundleValidity: undefined,
      frequency: 'monthly',
    }))).toBe(30);
  });

  it('skips consumer products, voice products and non-NAIRA prices', () => {
    expect(mapMtnProduct(product({
      name: '1GB Monthly',
      bundleCategory: 'DataPlan',
      subCategory: 'IDB1500',
      description: 'Consumer data',
    }))).toBeNull();
    expect(mapMtnProduct(product({ group: 'voice', bundleType: 'Voice' }))).toBeNull();
    expect(mapMtnProduct(product({ currency: 'USD' }))).toBeNull();
  });

  it('keeps an M2M product whose category does not say data', () => {
    expect(mapMtnProduct(product({
      name: 'M2M 1GB Monthly',
      bundleCategory: 'M2M',
      subCategory: 'Wholesale',
      description: 'Machine-to-machine connectivity',
      group: 'others',
    }))).not.toBeNull();
  });

  it('still skips M2M voice and combo bundles', () => {
    expect(mapMtnProduct(product({
      name: 'M2M Voice 1GB',
      bundleCategory: 'M2M',
      subCategory: 'Voice',
      description: 'Machine-to-machine voice bundle',
      group: 'others',
    }))).toBeNull();
  });

  it('skips a product with no usable data amount', () => {
    expect(mapMtnProduct(product({
      name: 'M2M Mystery bundle',
      bundleValue: undefined,
    }))).toBeNull();
  });
});
