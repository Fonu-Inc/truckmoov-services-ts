import { BillingValidationError } from './billing-errors';
import type {
  PriceChangeField,
  PriceChangeItemType,
  StoredBillingPriceChange,
} from './billing-price-change.repository';

const BILLING_TIME_ZONE = 'Africa/Lagos';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function lagosToday(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BILLING_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function isRealDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export function resolveEffectiveDate(
  value: string | undefined,
  now: Date,
): string {
  const today = lagosToday(now);
  if (value === undefined || value === '') return today;
  if (!ISO_DATE.test(value) || !isRealDate(value)) {
    throw new BillingValidationError(
      'effectiveDate',
      'effectiveDate must be a date in YYYY-MM-DD form',
    );
  }
  if (value > today) {
    throw new BillingValidationError(
      'effectiveDate',
      'effectiveDate cannot be in the future',
    );
  }
  return value;
}

export function requirePositiveInt(field: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new BillingValidationError(
      field,
      `${field} must be a positive whole number of naira`,
    );
  }
  return value;
}

export function requireReason(value: unknown): string {
  const reason = typeof value === 'string' ? value.trim() : '';
  if (reason.length === 0) {
    throw new BillingValidationError(
      'reason',
      'A reason is required when a price changes',
    );
  }
  if (reason.length > 500) {
    throw new BillingValidationError(
      'reason',
      'reason must be at most 500 characters',
    );
  }
  return reason;
}

export type PriceDelta = {
  field: PriceChangeField;
  oldPriceNgn: number;
  newPriceNgn: number;
};

export function realChanges(deltas: PriceDelta[]): PriceDelta[] {
  return deltas.filter((delta) => delta.oldPriceNgn !== delta.newPriceNgn);
}

export function toPriceChanges(input: {
  deltas: PriceDelta[];
  itemType: PriceChangeItemType;
  itemRef: string;
  effectiveDate: string;
  reason: string;
  actor: { userId: string; name: string };
  now: Date;
  nextId: () => string;
}): StoredBillingPriceChange[] {
  return input.deltas.map((delta) => ({
    id: input.nextId(),
    itemType: input.itemType,
    itemRef: input.itemRef,
    field: delta.field,
    oldPriceNgn: delta.oldPriceNgn,
    newPriceNgn: delta.newPriceNgn,
    effectiveDate: input.effectiveDate,
    reason: input.reason,
    changedByUserId: input.actor.userId,
    changedByName: input.actor.name,
    createdAt: input.now,
  }));
}

export function clampPage(page?: number, limit?: number) {
  const safeLimit = Math.min(Math.max(Math.trunc(limit ?? 20), 1), 100);
  const safePage = Math.max(Math.trunc(page ?? 1), 1);
  return { page: safePage, limit: safeLimit };
}
