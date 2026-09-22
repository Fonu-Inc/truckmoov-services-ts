import { Inject, Injectable } from '@nestjs/common';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
} from '@auth/onboarding/domain/onboarding-application.repository';
import { validateBusinessEmail } from '@auth/onboarding/domain/onboarding-application.validation';
import { GetOnboardingApplicationUseCase } from './get-onboarding-application.use-case';

@Injectable()
export class SetBillingEmailUseCase {
  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(GetOnboardingApplicationUseCase)
    private readonly getApplication: GetOnboardingApplicationUseCase,
  ) {}

  async execute(input: {
    applicationId: string;
    applicationToken: string;
    billingEmail: unknown;
  }) {
    const application = await this.getApplication.resolve(
      input.applicationId,
      input.applicationToken,
    );

    const billingEmail = validateBusinessEmail(input.billingEmail);
    const unchanged = billingEmail === application.billingEmail;

    await this.applications.save({
      ...application,
      billingEmail,
      // Changing the address drops its verification: the code was proven
      // against the old one.
      billingEmailVerifiedAt: unchanged
        ? application.billingEmailVerifiedAt
        : null,
      updatedAt: new Date(),
    });

    if (!unchanged) {
      await this.applications.invalidateVerificationCodes(
        application.id,
        'billing_email',
      );
    }

    return {
      status: true,
      message: 'Billing email saved',
      data: {
        billingEmail,
        billingEmailVerified: unchanged
          ? application.billingEmailVerifiedAt !== null
          : false,
      },
    };
  }
}
