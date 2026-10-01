import { Inject, Injectable } from '@nestjs/common';
import { ID_GENERATOR, type IdGenerator } from '@auth/session/domain/ports/id-generator.port';
import { BillingConflictError } from '@auth/onboarding/domain/billing-errors';
import { requirePositiveInt } from '@auth/onboarding/domain/billing-pricing';
import {
  BILLING_AUDIT,
  type BillingActor,
  type BillingAudit,
} from '@auth/onboarding/domain/ports/billing-audit.port';
import {
  M2M_LICENSE_PLAN_REPOSITORY,
  type M2mLicensePlanRepository,
  type StoredM2mLicensePlan,
} from '@auth/onboarding/domain/m2m-license-plan.repository';
import { success, toPlanView } from './billing-views';
import {
  optionalDescription,
  requireCode,
  requireComponents,
  requireName,
  requireValidityDays,
} from './plan-input';

export type CreateLicensePlanInput = {
  code: unknown;
  name: unknown;
  description?: unknown;
  perDeviceYear1Ngn: unknown;
  perDeviceRenewalNgn: unknown;
  validityDays?: unknown;
  components?: unknown;
  isActive?: boolean;
};

const DEFAULT_VALIDITY_DAYS = 365;

@Injectable()
export class CreateLicensePlanUseCase {
  constructor(
    @Inject(M2M_LICENSE_PLAN_REPOSITORY)
    private readonly plans: M2mLicensePlanRepository,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(BILLING_AUDIT) private readonly audit: BillingAudit,
  ) {}

  async execute(actor: BillingActor, input: CreateLicensePlanInput) {
    const now = new Date();
    const plan: StoredM2mLicensePlan = {
      id: this.ids.generate(),
      code: requireCode(input.code),
      name: requireName(input.name),
      description: optionalDescription(input.description),
      perDeviceYear1Ngn: requirePositiveInt('perDeviceYear1Ngn', input.perDeviceYear1Ngn),
      perDeviceRenewalNgn: requirePositiveInt('perDeviceRenewalNgn', input.perDeviceRenewalNgn),
      validityDays: requireValidityDays(input.validityDays ?? DEFAULT_VALIDITY_DAYS),
      components:
        input.components === undefined ? null : requireComponents(input.components),
      lastPriceChangedAt: null,
      sortOrder: await this.plans.nextSortOrder(),
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };

    if (!(await this.plans.insertIfMissing(plan))) {
      throw new BillingConflictError(`A plan with code ${plan.code} already exists`);
    }

    await this.audit.record(actor, {
      action: 'system.billing.plan_created',
      entityType: 'm2m_license_plan',
      entityId: plan.code,
      summary: `Licence plan ${plan.code} created`,
      metadata: {
        perDeviceYear1Ngn: plan.perDeviceYear1Ngn,
        perDeviceRenewalNgn: plan.perDeviceRenewalNgn,
        validityDays: plan.validityDays,
        isActive: plan.isActive,
      },
    });

    return success({ plan: toPlanView(plan) }, 'Plan created');
  }
}
