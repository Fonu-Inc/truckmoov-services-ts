import { Inject, Injectable } from '@nestjs/common';
import {
  M2M_LICENSE_PLAN_REPOSITORY,
  type M2mLicensePlanRepository,
} from '@auth/onboarding/domain/m2m-license-plan.repository';

@Injectable()
export class GetM2mLicensePlansUseCase {
  constructor(
    @Inject(M2M_LICENSE_PLAN_REPOSITORY)
    private readonly plans: M2mLicensePlanRepository,
  ) {}

  async execute() {
    const plans = await this.plans.findActive();

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
      },
    };
  }
}
