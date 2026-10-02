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

export const TENANT_PAYMENT_STATUSES = ['successful', 'pending', 'failed', 'refunded'] as const;
export type TenantPaymentStatus = (typeof TENANT_PAYMENT_STATUSES)[number];

/** A payment waiting on staff review is still pending from the tenant's side. */
export function toTenantPaymentStatus(status: OnboardingPaymentStatus): TenantPaymentStatus {
  const api = STORED_TO_API[status];
  return api === 'requires_review' ? 'pending' : api;
}

export function storedTenantPaymentStatuses(status: TenantPaymentStatus): OnboardingPaymentStatus[] {
  return (Object.keys(STORED_TO_API) as OnboardingPaymentStatus[]).filter(
    (stored) => toTenantPaymentStatus(stored) === status,
  );
}
