import type { StoredBillingPriceChange } from '@auth/onboarding/domain/billing-price-change.repository';
import type { StoredM2mLicensePlan } from '@auth/onboarding/domain/m2m-license-plan.repository';

export function toPlanView(plan: StoredM2mLicensePlan) {
  return {
    code: plan.code,
    name: plan.name,
    description: plan.description,
    perDeviceYear1Ngn: plan.perDeviceYear1Ngn,
    perDeviceRenewalNgn: plan.perDeviceRenewalNgn,
    validityDays: plan.validityDays,
    components: plan.components ?? [],
    isActive: plan.isActive,
    sortOrder: plan.sortOrder,
    lastPriceChangedAt: plan.lastPriceChangedAt?.toISOString() ?? null,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

export function toPriceChangeView(change: StoredBillingPriceChange) {
  return {
    id: change.id,
    itemType: change.itemType,
    itemRef: change.itemRef,
    field: change.field,
    oldPriceNgn: change.oldPriceNgn,
    newPriceNgn: change.newPriceNgn,
    effectiveDate: change.effectiveDate,
    reason: change.reason,
    changedByUserId: change.changedByUserId,
    changedByName: change.changedByName,
    createdAt: change.createdAt.toISOString(),
  };
}

export function success<T>(data: T, message = 'success') {
  return { status: true, message, data };
}
