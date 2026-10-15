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
  /** The tenant the money belongs to. Set when the payment is created; older rows are null and reads fall back to the invoice, quotation and application joins. */
  tenantId?: string | null;
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
  refundedAt?: Date | null;
  refundReference?: string | null;
  refundError?: string | null;
  refundPendingAt?: Date | null;
  refundNote?: string | null;
  refundRequestedBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const RENEWAL_REFERENCE_PREFIX = 'RNW-';

export function isRenewalReference(reference: string): boolean {
  return reference.startsWith(RENEWAL_REFERENCE_PREFIX);
}

/** Renewal payments share the application id but are billed through invoices, never refunded here. */
export function isOnboardingPayment(payment: Pick<StoredOnboardingPayment, 'reference' | 'invoiceId'>): boolean {
  return !isRenewalReference(payment.reference) && !payment.invoiceId;
}

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

export type RefundRecord = {
  refundedAt: Date;
  refundReference: string | null;
};

export type RefundClaim = {
  note: string;
  requestedBy: string;
};

export interface OnboardingPaymentRepository {
  save(payment: StoredOnboardingPayment): Promise<void>;
  findByReference(reference: string): Promise<StoredOnboardingPayment | null>;
  /** The newest onboarding payment. Renewal payments share the application id and never count; a paid onboarding payment keeps counting after its invoice is linked. */
  findLatestForApplication(
    applicationId: string,
  ): Promise<StoredOnboardingPayment | null>;
  /** A paid onboarding payment for the application, if any. Renewals never count. */
  findPaidForApplication(applicationId: string): Promise<StoredOnboardingPayment | null>;
  /** Wallet renewal rows (RNW-W-) still pending or paid, created in [createdFrom, createdBefore). */
  findWalletRenewalAttempts(createdFrom: Date, createdBefore: Date): Promise<StoredOnboardingPayment[]>;
  /** Onboarding payments whose refund claim was taken before `claimedBefore` and is still unresolved, oldest claim first. */
  findStaleRefundClaims(claimedBefore: Date, limit: number): Promise<StoredOnboardingPayment[]>;
  /** Onboarding payments in mismatch, newest first; refunded ones follow when asked for. Renewals are never listed. */
  listMismatchedForApplication(
    applicationId: string,
    includeRefunded?: boolean,
  ): Promise<StoredOnboardingPayment[]>;
  findByQuotationId(quotationId: string): Promise<StoredOnboardingPayment[]>;
  findByInvoiceId(invoiceId: string): Promise<StoredOnboardingPayment[]>;
  findReusablePending(
    applicationId: string,
    amountKobo: number,
    planCode: string,
    createdSince: Date,
  ): Promise<StoredOnboardingPayment | null>;
  setAuthorizationUrl(id: string, authorizationUrl: string | null): Promise<void>;
  /** Moves a pending payment to a final status; paid may also settle failed or mismatch rows, but never one with a refund in flight. False when not settleable. */
  settlePending(
    id: string,
    status: Exclude<OnboardingPaymentStatus, 'pending'>,
    paidAt: Date | null,
    details?: SettleDetails,
  ): Promise<boolean>;
  /** Records a staff decision on a mismatched payment; false when it is not in mismatch. */
  reviewMismatch(id: string, review: MismatchReview): Promise<boolean>;
  /** Atomically takes the right to call the provider for a reviewed mismatch; false when another caller holds it or it is not refundable. */
  claimRefund(id: string, claim: RefundClaim): Promise<boolean>;
  /** Keeps the provider's refund id once it has queued the refund; the claim stays held until it finishes. */
  recordRefundAccepted(id: string, providerRefundId: string | null): Promise<void>;
  /** Notes something staff must look at on a payment, whatever its status. */
  flagForReview(id: string, note: string): Promise<void>;
  /** Moves a reviewed mismatch to refunded; false when it is not in mismatch. */
  markRefunded(id: string, refund: RefundRecord): Promise<boolean>;
  /** Keeps the provider's refusal on a mismatch payment and releases the claim so staff can retry. With `onlyIfClaimedBefore`, a claim taken since then is left alone. */
  recordRefundError(id: string, error: string, onlyIfClaimedBefore?: Date): Promise<void>;
  /** Links a payment to its invoice once; a payment already linked is left alone. */
  linkInvoice(id: string, invoiceId: string): Promise<void>;
  deleteUnstarted(id: string): Promise<void>;
  deleteForApplication(applicationId: string): Promise<void>;
}

export const ONBOARDING_PAYMENT_REPOSITORY = Symbol(
  'ONBOARDING_PAYMENT_REPOSITORY',
);
