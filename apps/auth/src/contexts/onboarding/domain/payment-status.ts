import type { OnboardingPaymentStatus } from './onboarding-payment.repository';

export const PAYMENT_API_STATUSES = [
  'pending',
  'successful',
  'failed',
  'requires_review',
  'refunded',
] as const;
export type PaymentApiStatus = (typeof PAYMENT_API_STATUSES)[number];

const STORED_TO_API: Record<OnboardingPaymentStatus, PaymentApiStatus> = {
  pending: 'pending',
  paid: 'successful',
  failed: 'failed',
  mismatch: 'requires_review',
  requires_review: 'requires_review',
  refunded: 'refunded',
};

export function toApiPaymentStatus(
  status: OnboardingPaymentStatus,
): PaymentApiStatus {
  return STORED_TO_API[status];
}

export function storedPaymentStatuses(
  status: PaymentApiStatus,
): OnboardingPaymentStatus[] {
  return (Object.keys(STORED_TO_API) as OnboardingPaymentStatus[]).filter(
    (stored) => STORED_TO_API[stored] === status,
  );
}
