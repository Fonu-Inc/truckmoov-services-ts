import { Inject, Injectable } from '@nestjs/common';
import {
  M2M_LICENSE_PLAN_REPOSITORY,
  type M2mLicensePlanRepository,
} from '@auth/onboarding/domain/m2m-license-plan.repository';
import {
  BILLING_SETTINGS_REPOSITORY,
  type BillingSettingsRepository,
} from '@auth/onboarding/domain/billing-settings.repository';
import { loadTelecomMasterSimNgn } from './support/installation-fees';

@Injectable()
export class GetM2mLicensePlansUseCase {
  constructor(
    @Inject(M2M_LICENSE_PLAN_REPOSITORY)
    private readonly plans: M2mLicensePlanRepository,
    @Inject(BILLING_SETTINGS_REPOSITORY)
    private readonly settings: BillingSettingsRepository,
  ) {}

  async execute() {
    const [plans, telecomMasterSimNgn] = await Promise.all([
      this.plans.findActive(),
      loadTelecomMasterSimNgn(this.settings),
    ]);

    return {
      status: true,
      message: 'success',
      data: {
        plans: plans.map((plan) => ({
          code: plan.code,
          name: plan.name,
          description: plan.description,
          perDeviceYear1Ngn: plan.perDeviceYear1Ngn,
          perDeviceRenewalNgn: plan.perDeviceRenewalNgn,
        })),
        telecomMasterSimNgn,
      },
    };
  }
}
