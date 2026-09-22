export const ONBOARDING_PAYMENT_STATUSES = [
  'pending',
  'paid',
  'failed',
] as const;
export type OnboardingPaymentStatus =
  (typeof ONBOARDING_PAYMENT_STATUSES)[number];

/**
 * Money taken for an application, before any tenant exists to bill.
 *
 * Separate from the tenant subscription records: this is a one-off charge for
 * a licence and an installation, paid by somebody who does not yet have an
 * account, and the reference is what ties a provider callback back to it.
 */
export type StoredOnboardingPayment = {
  id: string;
  applicationId: string;
  /** Ours, unique, echoed back by the provider on the callback. */
  reference: string;
  provider: string;
  amountKobo: number;
  billingEmail: string;
  planCode: string;
  deviceCount: number;
  status: OnboardingPaymentStatus;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export interface OnboardingPaymentRepository {
  save(payment: StoredOnboardingPayment): Promise<void>;
  findByReference(reference: string): Promise<StoredOnboardingPayment | null>;
  findLatestForApplication(
    applicationId: string,
  ): Promise<StoredOnboardingPayment | null>;
  deleteForApplication(applicationId: string): Promise<void>;
}

export const ONBOARDING_PAYMENT_REPOSITORY = Symbol(
  'ONBOARDING_PAYMENT_REPOSITORY',
);
