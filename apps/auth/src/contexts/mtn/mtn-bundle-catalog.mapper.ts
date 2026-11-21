import type { MtnProduct } from './mtn-m2m.client';

export const MTN_CARRIER_ID = 'carrier-mtn';
export const MTN_BUNDLE_ID_PREFIX = 'bundle-mtn-m2m-';

export type MappedMtnBundle = {
  id: string;
  code: string;
  name: string;
  carrierId: string;
  dataAmountGb: number;
  validityDays: number;
  billingCycle: string;
  priceKobo: number;
  currency: string;
  active: boolean;
};

/**
 * Turns one MTN product into a row the existing bundle catalogue and top-up
 * flow already understand. Returns null for non-data products, non-NAIRA
 * prices, and rows without a usable data amount.
 */
export function mapMtnProduct(product: MtnProduct): MappedMtnBundle | null {
  if (!isDataProduct(product)) return null;
  if ((product.currency || 'NGN').toUpperCase() !== 'NGN') return null;

  const dataAmountGb = dataAmountInGb(product);
  if (!dataAmountGb || dataAmountGb <= 0) return null;

  const validityDays = validityInDays(product);
  const amount = Number(product.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  return {
    id: `${MTN_BUNDLE_ID_PREFIX}${product.id}`,
    code: `MTN-M2M-${sanitiseCode(product.id)}`,
    name: product.name.slice(0, 255),
    carrierId: MTN_CARRIER_ID,
    dataAmountGb: round(dataAmountGb, 2),
    validityDays,
    billingCycle: cycleFor(validityDays),
    priceKobo: Math.round(amount * 100),
    currency: 'NGN',
    active: true,
  };
}

export function isDataProduct(product: MtnProduct): boolean {
  if (product.group === 'data') return true;
  const marker = `${product.bundleType ?? ''} ${product.bundleCategory ?? ''}`.toLowerCase();
  return marker.includes('data') && !marker.includes('voice');
}

export function dataAmountInGb(product: MtnProduct): number | null {
  const raw = product.bundleValue?.value;
  const units = (product.bundleValue?.units ?? '').trim().toLowerCase();
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    if (units === 'gb' || units === 'gigabyte' || units === 'gigabytes') return raw;
    if (units === 'mb' || units === 'megabyte' || units === 'megabytes') return raw / 1024;
    if (units === 'tb' || units === 'terabyte' || units === 'terabytes') return raw * 1024;
  }
  return parseAmountFromName(product.name);
}

export function validityInDays(product: MtnProduct): number {
  const text = product.bundleValidity ?? '';
  const match = text.match(/(\d+)\s*(day|days|week|weeks|month|months|year|years)/i);
  if (match) {
    const count = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (unit.startsWith('day')) return count;
    if (unit.startsWith('week')) return count * 7;
    if (unit.startsWith('month')) return count * 30;
    if (unit.startsWith('year')) return count * 365;
  }

  switch (product.frequency) {
    case 'daily':
      return 1;
    case 'weekly':
      return 7;
    case 'monthly':
      return 30;
    default:
      return 1;
  }
}

function parseAmountFromName(name: string): number | null {
  const match = name.match(/(\d+(?:\.\d+)?)\s*(GB|MB|TB)/i);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2].toUpperCase();
  if (!Number.isFinite(value) || value <= 0) return null;
  if (unit === 'MB') return value / 1024;
  if (unit === 'TB') return value * 1024;
  return value;
}

function cycleFor(days: number): string {
  if (days <= 1) return 'daily';
  if (days <= 7) return 'weekly';
  if (days <= 31) return 'monthly';
  return 'yearly';
}

function sanitiseCode(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
