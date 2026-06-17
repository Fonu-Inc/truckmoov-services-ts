import { Inject, Injectable } from '@nestjs/common';
import {
  TENANT_ONBOARDING_REPOSITORY,
  type TenantOnboardingRepository,
} from './tenant-onboarding.repository';

export class OnboardingNotFoundError extends Error {}

@Injectable()
export class ActivateSubscriptionUseCase {
  constructor(
    @Inject(TENANT_ONBOARDING_REPOSITORY)
    private readonly onboardingRepository: TenantOnboardingRepository,
  ) {}

  async execute(tenantId: string, reference: string): Promise<void> {
    const onboarding = await this.onboardingRepository.findByTenantId(tenantId);
    if (!onboarding) throw new OnboardingNotFoundError('Onboarding record not found');

    await this.onboardingRepository.save({
      ...onboarding,
      paymentReference: reference,
      subscriptionActivatedAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
