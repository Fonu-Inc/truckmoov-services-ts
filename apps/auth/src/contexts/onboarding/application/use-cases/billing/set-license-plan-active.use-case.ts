import { Inject, Injectable } from '@nestjs/common';
import { BillingNotFoundError } from '@auth/onboarding/domain/billing-errors';
import {
  BILLING_AUDIT,
  type BillingActor,
  type BillingAudit,
} from '@auth/onboarding/domain/ports/billing-audit.port';
import {
  M2M_LICENSE_PLAN_REPOSITORY,
  type M2mLicensePlanRepository,
} from '@auth/onboarding/domain/m2m-license-plan.repository';
import { success, toPlanView } from './billing-views';

@Injectable()
export class SetLicensePlanActiveUseCase {
  constructor(
    @Inject(M2M_LICENSE_PLAN_REPOSITORY)
    private readonly plans: M2mLicensePlanRepository,
    @Inject(BILLING_AUDIT) private readonly audit: BillingAudit,
  ) {}

  async execute(actor: BillingActor, code: string, isActive: boolean) {
    const existing = await this.plans.findByCode(code);
    if (!existing) throw new BillingNotFoundError('Plan not found');
    if (existing.isActive === isActive) {
      return success({ plan: toPlanView(existing) });
    }

    const updated = { ...existing, isActive, updatedAt: new Date() };
    await this.plans.save(updated);
    await this.audit.record(actor, {
      action: isActive
        ? 'system.billing.plan_activated'
        : 'system.billing.plan_deactivated',
      entityType: 'm2m_license_plan',
      entityId: existing.code,
      summary: `Licence plan ${existing.code} ${isActive ? 'activated' : 'deactivated'}`,
    });

    return success({ plan: toPlanView(updated) });
  }
}
