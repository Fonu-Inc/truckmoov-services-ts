import type { OnboardingOrderSummary } from './onboarding-order';
import type { PaymentMethod } from './payment-method';

export const ONBOARDING_PAYMENT_STATUSES = [
  'pending',
  'paid',
  'failed',
  'mismatch',
  'refunded',
  'requires_review',
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
  authorizationUrl: string | null;
  billingEmail: string;
  planCode: string;
  deviceCount: number;
  orderSummary: OnboardingOrderSummary | null;
  quotationId: string | null;
  invoiceId: string | null;
  method: PaymentMethod | null;
  customerName: string | null;
  note: string | null;
  autoReconciled: boolean;
  status: OnboardingPaymentStatus;
  paidAt: Date | null;
  /** What the provider actually took, recorded when it differs from what was asked. */
  receivedAmountKobo?: number | null;
  receivedCurrency?: string | null;
  reviewOutcome?: MismatchReviewOutcome | null;
  reviewNote?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export const MISMATCH_REVIEW_OUTCOMES = ['resolved', 'refund_needed'] as const;
export type MismatchReviewOutcome = (typeof MISMATCH_REVIEW_OUTCOMES)[number];

export type SettleDetails = {
  method: PaymentMethod | null;
  autoReconciled: boolean;
  receivedAmountKobo?: number | null;
  receivedCurrency?: string | null;
};

export type MismatchReview = {
  outcome: MismatchReviewOutcome;
  note: string;
  reviewedBy: string;
  reviewedAt: Date;
};

export interface OnboardingPaymentRepository {
  save(payment: StoredOnboardingPayment): Promise<void>;
  findByReference(reference: string): Promise<StoredOnboardingPayment | null>;
  findLatestForApplication(
    applicationId: string,
  ): Promise<StoredOnboardingPayment | null>;
  findByQuotationId(quotationId: string): Promise<StoredOnboardingPayment[]>;
  findByInvoiceId(invoiceId: string): Promise<StoredOnboardingPayment[]>;
  findReusablePending(
    applicationId: string,
    amountKobo: number,
    planCode: string,
    createdSince: Date,
  ): Promise<StoredOnboardingPayment | null>;
  setAuthorizationUrl(id: string, authorizationUrl: string | null): Promise<void>;
  /** Moves a pending payment to a final status; paid may also settle failed or mismatch rows. False when not settleable. */
  settlePending(
    id: string,
    status: Exclude<OnboardingPaymentStatus, 'pending'>,
    paidAt: Date | null,
    details?: SettleDetails,
  ): Promise<boolean>;
  /** Records a staff decision on a mismatched payment; false when it is not in mismatch. */
  reviewMismatch(id: string, review: MismatchReview): Promise<boolean>;
  /** Links a payment to its invoice once; a payment already linked is left alone. */
  linkInvoice(id: string, invoiceId: string): Promise<void>;
  deleteUnstarted(id: string): Promise<void>;
  deleteForApplication(applicationId: string): Promise<void>;
}

export const ONBOARDING_PAYMENT_REPOSITORY = Symbol(
  'ONBOARDING_PAYMENT_REPOSITORY',
);
