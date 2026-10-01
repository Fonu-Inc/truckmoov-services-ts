import { Inject, Injectable } from '@nestjs/common';
import { ID_GENERATOR, type IdGenerator } from '@auth/session/domain/ports/id-generator.port';
import { BillingNotFoundError } from '@auth/onboarding/domain/billing-errors';
import {
  realChanges,
  requirePositiveInt,
  requireReason,
  resolveEffectiveDate,
  toPriceChanges,
  type PriceDelta,
} from '@auth/onboarding/domain/billing-pricing';
import {
  BILLING_AUDIT,
  type BillingActor,
  type BillingAudit,
  type BillingAuditEntry,
} from '@auth/onboarding/domain/ports/billing-audit.port';
import type { StoredBillingPriceChange } from '@auth/onboarding/domain/billing-price-change.repository';
import {
  M2M_LICENSE_PLAN_REPOSITORY,
  type M2mLicensePlanRepository,
  type StoredM2mLicensePlan,
} from '@auth/onboarding/domain/m2m-license-plan.repository';
import { success, toPlanView, toPriceChangeView } from './billing-views';
import {
  optionalDescription,
  requireComponents,
  requireName,
  requireValidityDays,
} from './plan-input';

export type UpdateLicensePlanInput = {
  name?: unknown;
  description?: unknown;
  validityDays?: unknown;
  components?: unknown;
  perDeviceYear1Ngn?: unknown;
  perDeviceRenewalNgn?: unknown;
  reason?: unknown;
  effectiveDate?: string;
};

@Injectable()
export class UpdateLicensePlanUseCase {
  constructor(
    @Inject(M2M_LICENSE_PLAN_REPOSITORY)
    private readonly plans: M2mLicensePlanRepository,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(BILLING_AUDIT) private readonly audit: BillingAudit,
  ) {}

  async execute(actor: BillingActor, code: string, input: UpdateLicensePlanInput) {
    const now = new Date();
    const effectiveDate = resolveEffectiveDate(input.effectiveDate, now);
    const priceChanges: StoredBillingPriceChange[] = [];
    const edited: string[] = [];

    const result = await this.plans.editPriced(code, (existing) => {
      const changed = realChanges(priceDeltas(existing, input));
      const updated = applyEdits(existing, input, changed, now);
      edited.push(...describeEdits(existing, updated));
      if (edited.length === 0) return null;
      if (changed.length > 0) {
        priceChanges.push(
          ...toPriceChanges({
            deltas: changed,
            itemType: 'm2m_plan',
            itemRef: existing.code,
            effectiveDate,
            reason: requireReason(input.reason),
            actor,
            now,
            nextId: () => this.ids.generate(),
          }),
        );
      }
      return { plan: updated, changes: priceChanges };
    });
    if (!result) throw new BillingNotFoundError('Plan not found');
    if (edited.length === 0) {
      return success({ plan: toPlanView(result.before), priceChanges: [] }, 'No changes');
    }

    await this.audit.record(actor, auditEntry(result.before, edited, priceChanges));

    return success({
      plan: toPlanView(result.after),
      priceChanges: priceChanges.map(toPriceChangeView),
    }, 'Plan updated');
  }
}

function priceDeltas(
  existing: StoredM2mLicensePlan,
  input: UpdateLicensePlanInput,
): PriceDelta[] {
  const deltas: PriceDelta[] = [];
  if (input.perDeviceYear1Ngn !== undefined) {
    deltas.push({
      field: 'year1',
      oldPriceNgn: existing.perDeviceYear1Ngn,
      newPriceNgn: requirePositiveInt('perDeviceYear1Ngn', input.perDeviceYear1Ngn),
    });
  }
  if (input.perDeviceRenewalNgn !== undefined) {
    deltas.push({
      field: 'renewal',
      oldPriceNgn: existing.perDeviceRenewalNgn,
      newPriceNgn: requirePositiveInt('perDeviceRenewalNgn', input.perDeviceRenewalNgn),
    });
  }
  return deltas;
}

function applyEdits(
  existing: StoredM2mLicensePlan,
  input: UpdateLicensePlanInput,
  changed: PriceDelta[],
  now: Date,
): StoredM2mLicensePlan {
  const newPrice = (field: PriceDelta['field'], current: number) =>
    changed.find((delta) => delta.field === field)?.newPriceNgn ?? current;

  return {
    ...existing,
    name: input.name === undefined ? existing.name : requireName(input.name),
    description:
      input.description === undefined
        ? existing.description
        : optionalDescription(input.description),
    validityDays:
      input.validityDays === undefined
        ? existing.validityDays
        : requireValidityDays(input.validityDays),
    components:
      input.components === undefined
        ? existing.components
        : requireComponents(input.components),
    perDeviceYear1Ngn: newPrice('year1', existing.perDeviceYear1Ngn),
    perDeviceRenewalNgn: newPrice('renewal', existing.perDeviceRenewalNgn),
    lastPriceChangedAt: changed.length > 0 ? now : existing.lastPriceChangedAt,
    updatedAt: now,
  };
}

const EDITABLE_FIELDS = [
  'name',
  'description',
  'validityDays',
  'perDeviceYear1Ngn',
  'perDeviceRenewalNgn',
] as const;

function describeEdits(
  before: StoredM2mLicensePlan,
  after: StoredM2mLicensePlan,
): string[] {
  const edited: string[] = EDITABLE_FIELDS.filter(
    (field) => before[field] !== after[field],
  );
  if (JSON.stringify(before.components) !== JSON.stringify(after.components)) {
    edited.push('components');
  }
  return edited;
}

function auditEntry(
  plan: StoredM2mLicensePlan,
  edited: string[],
  priceChanges: StoredBillingPriceChange[],
): BillingAuditEntry {
  const priced = priceChanges.length > 0;
  return {
    action: priced ? 'system.billing.plan_price_changed' : 'system.billing.plan_updated',
    entityType: 'm2m_license_plan',
    entityId: plan.code,
    summary: priced
      ? `Licence plan ${plan.code} price changed`
      : `Licence plan ${plan.code} updated`,
    metadata: {
      fields: edited,
      priceChanges: priceChanges.map(({ field, oldPriceNgn, newPriceNgn }) => ({
        field,
        oldPriceNgn,
        newPriceNgn,
      })),
      ...(priced && {
        reason: priceChanges[0].reason,
        effectiveDate: priceChanges[0].effectiveDate,
      }),
    },
  };
}
