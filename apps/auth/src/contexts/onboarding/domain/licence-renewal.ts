import { addDaysToDate, lagosDate } from './invoice-dates';
import { toKobo } from './onboarding-order';
import { computeTotals, type QuotationTotals } from './quotation-totals';
import type { LicencePeriodOrigin, PurchaseSeed } from './licence-period.repository';

export const BACKFILL_MIN_DAYS = 30;
export const MAX_CARD_KOBO = 2_000_000_000;

export function seedPeriodDates(
  seed: PurchaseSeed,
  today: string,
): { periodStart: string; periodEnd: string; origin: LicencePeriodOrigin } {
  const periodStart = lagosDate(seed.paidAt);
  const periodEnd = addDaysToDate(periodStart, seed.validityDays);
  const floor = addDaysToDate(today, BACKFILL_MIN_DAYS);
  if (periodEnd >= floor) return { periodStart, periodEnd, origin: 'purchase' };
  return { periodStart, periodEnd: floor, origin: 'backfill' };
}

export function withinLeadWindow(periodEnd: string, today: string, leadDays: number): boolean {
  return periodEnd <= addDaysToDate(today, leadDays);
}

export function renewalDueDate(periodEnd: string, issueDate: string): string {
  return periodEnd > issueDate ? periodEnd : issueDate;
}

export function billableDeviceCount(purchased: number, fleetDevices: number): number {
  return Math.max(purchased, fleetDevices);
}

export type RenewalPricing = { unitPriceKobo: number; deviceCount: number; totals: QuotationTotals };

export function priceRenewal(
  plan: { perDeviceRenewalNgn: number },
  deviceCount: number,
  taxRateBp: number,
): RenewalPricing {
  const unitPriceKobo = toKobo(plan.perDeviceRenewalNgn);
  return {
    unitPriceKobo,
    deviceCount,
    totals: computeTotals([{ quantity: deviceCount, unitPriceKobo }], 0, taxRateBp),
  };
}

export function nextPeriodDates(
  oldEnd: string,
  validityDays: number,
  today: string,
): { periodStart: string; periodEnd: string } {
  const extended = addDaysToDate(oldEnd, validityDays);
  if (extended >= today) return { periodStart: addDaysToDate(oldEnd, 1), periodEnd: extended };
  return { periodStart: today, periodEnd: addDaysToDate(today, validityDays) };
}

export function renewalLineName(planName: string): string {
  return `${planName} licence renewal`;
}
