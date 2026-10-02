import {
  type OnboardingPaymentRepository,
  type StoredOnboardingPayment,
} from '@auth/onboarding/domain/onboarding-payment.repository';

/** An explicit payment id must be one of the application's onboarding payments; without one, the newest mismatch wins. */
export async function resolveOnboardingPayment(
  payments: OnboardingPaymentRepository,
  applicationId: string,
  options: { paymentId?: string; includeRefunded: boolean },
): Promise<StoredOnboardingPayment | null> {
  const candidates = await payments.listMismatchedForApplication(applicationId, options.includeRefunded);
  if (options.paymentId) return candidates.find((payment) => payment.id === options.paymentId) ?? null;
  return candidates.find((payment) => payment.status === 'mismatch') ?? candidates[0] ?? null;
}
