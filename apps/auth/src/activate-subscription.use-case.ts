import { Inject, Injectable } from '@nestjs/common';
import {
  TENANT_BILLING_CYCLES,
  TENANT_ONBOARDING_REPOSITORY,
  type TenantBillingCycle,
  type TenantOnboardingRepository,
} from './tenant-onboarding.repository';

export class OnboardingNotFoundError extends Error {}

@Injectable()
export class ActivateSubscriptionUseCase {
  constructor(
    @Inject(TENANT_ONBOARDING_REPOSITORY)
    private readonly onboardingRepository: TenantOnboardingRepository,
  ) {}

  async execute(
    tenantId: string,
    reference: string,
    selection?: { planCode?: string; billingCycle?: string },
  ): Promise<void> {
    const onboarding = await this.onboardingRepository.findByTenantId(tenantId);
    if (!onboarding) throw new OnboardingNotFoundError('Onboarding record not found');

    // A tenant approved from a landing-page application has no plan on its
    // record: nobody chose one for it. The plan it actually paid for arrives in
    // the payment metadata, so it is recorded here. A tenant that already has a
    // plan keeps it — this must not let a payment rewrite an admin's choice.
    const planCode = onboarding.subscription.planCode
      ? onboarding.subscription.planCode
      : (selection?.planCode?.trim() ?? '');
    const billingCycle = onboarding.subscription.planCode
      ? onboarding.subscription.billingCycle
      : resolveBillingCycle(selection?.billingCycle, onboarding.subscription.billingCycle);

    await this.onboardingRepository.save({
      ...onboarding,
      subscription: { planCode, billingCycle },
      paymentReference: reference,
      subscriptionActivatedAt: new Date(),
      updatedAt: new Date(),
    });
  }
}

function resolveBillingCycle(
  candidate: string | undefined,
  fallback: TenantBillingCycle,
): TenantBillingCycle {
  const normalized = candidate?.trim() as TenantBillingCycle | undefined;
  return normalized && TENANT_BILLING_CYCLES.includes(normalized)
    ? normalized
    : fallback;
}
