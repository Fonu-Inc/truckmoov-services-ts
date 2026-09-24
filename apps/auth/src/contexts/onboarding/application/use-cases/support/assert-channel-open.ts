import type {
  OnboardingVerificationChannel,
  StoredOnboardingApplication,
} from '@auth/onboarding/domain/onboarding-application.repository';
import type { OnboardingPaymentRepository } from '@auth/onboarding/domain/onboarding-payment.repository';
import { assertVerificationChannelOpen } from '@auth/onboarding/domain/onboarding-application.support';

export async function assertChannelOpen(
  payments: OnboardingPaymentRepository,
  application: StoredOnboardingApplication,
  channel: OnboardingVerificationChannel,
): Promise<void> {
  const latestPayment =
    channel === 'billing_email'
      ? await payments.findLatestForApplication(application.id)
      : null;
  assertVerificationChannelOpen(application, channel, latestPayment);
}
