import type { StoredBillingPriceChange } from '@auth/onboarding/domain/billing-price-change.repository';
import type { PriceChangeField, PriceChangeItemType } from '@auth/onboarding/domain/billing-price-change.repository';
import type { StoredBillingSetting } from '@auth/onboarding/domain/billing-settings.repository';
import type { StoredM2mLicensePlan } from '@auth/onboarding/domain/m2m-license-plan.repository';
import {
  BillingPriceChangeRecord,
  BillingSettingRecord,
  type M2mLicensePlanRecord,
} from './onboarding-orm';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function toDateString(value: unknown): string {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  return String(value).slice(0, 10);
}

export function toPlan(r: M2mLicensePlanRecord): StoredM2mLicensePlan {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description,
    perDeviceYear1Ngn: Number(r.perDeviceYear1Ngn),
    perDeviceRenewalNgn: Number(r.perDeviceRenewalNgn),
    validityDays: Number(r.validityDays ?? 365),
    components: Array.isArray(r.components) ? r.components.map(String) : null,
    lastPriceChangedAt: r.lastPriceChangedAt
      ? new Date(r.lastPriceChangedAt)
      : null,
    sortOrder: Number(r.sortOrder),
    isActive: r.isActive,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function toPriceChange(
  r: BillingPriceChangeRecord,
): StoredBillingPriceChange {
  return {
    id: r.id,
    itemType: r.itemType as PriceChangeItemType,
    itemRef: r.itemRef,
    field: r.field as PriceChangeField,
    oldPriceNgn: Number(r.oldPriceNgn),
    newPriceNgn: Number(r.newPriceNgn),
    effectiveDate: toDateString(r.effectiveDate),
    reason: r.reason,
    changedByUserId: r.changedByUserId,
    changedByName: r.changedByName,
    createdAt: r.createdAt,
  };
}

export function toPriceChangeRecord(
  change: StoredBillingPriceChange,
): BillingPriceChangeRecord {
  return Object.assign(new BillingPriceChangeRecord(), change);
}

export function toSetting(r: BillingSettingRecord): StoredBillingSetting {
  return {
    key: r.key,
    value: Number(r.valueJson),
    updatedAt: r.updatedAt,
    updatedBy: r.updatedBy,
  };
}
