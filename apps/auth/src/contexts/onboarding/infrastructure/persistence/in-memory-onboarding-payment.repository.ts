import { Injectable } from '@nestjs/common';
import {
  isOnboardingPayment,
  isRenewalReference,
  type MismatchReview,
  type OnboardingPaymentRepository,
  type OnboardingPaymentStatus,
  type RefundClaim,
  type RefundRecord,
  type SettleDetails,
  type StoredOnboardingPayment,
} from '@auth/onboarding/domain/onboarding-payment.repository';

@Injectable()
export class InMemoryOnboardingPaymentRepository
  implements OnboardingPaymentRepository
{
  private readonly payments = new Map<string, StoredOnboardingPayment>();

  all(): StoredOnboardingPayment[] {
    return [...this.payments.values()];
  }

  async save(payment: StoredOnboardingPayment): Promise<void> {
    this.payments.set(payment.id, { ...payment });
  }

  async findByReference(
    reference: string,
  ): Promise<StoredOnboardingPayment | null> {
    return (
      [...this.payments.values()].find(
        (payment) => payment.reference === reference,
      ) ?? null
    );
  }

  async findLatestForApplication(
    applicationId: string,
  ): Promise<StoredOnboardingPayment | null> {
    return (
      [...this.payments.values()]
        .filter((payment) => payment.applicationId === applicationId && !isRenewalReference(payment.reference))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
    );
  }

  async findStaleRefundClaims(claimedBefore: Date, limit: number): Promise<StoredOnboardingPayment[]> {
    return [...this.payments.values()]
      .filter(
        (payment) =>
          payment.status === 'mismatch' &&
          isOnboardingPayment(payment) &&
          payment.refundPendingAt != null &&
          payment.refundPendingAt < claimedBefore,
      )
      .sort((a, b) => a.refundPendingAt!.getTime() - b.refundPendingAt!.getTime())
      .slice(0, limit);
  }

  async listMismatchedForApplication(
    applicationId: string,
    includeRefunded = false,
  ): Promise<StoredOnboardingPayment[]> {
    const wanted = includeRefunded ? ['mismatch', 'refunded'] : ['mismatch'];
    return [...this.payments.values()]
      .filter(
        (payment) =>
          payment.applicationId === applicationId &&
          wanted.includes(payment.status) &&
          isOnboardingPayment(payment),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findByQuotationId(
    quotationId: string,
  ): Promise<StoredOnboardingPayment[]> {
    return [...this.payments.values()]
      .filter((payment) => payment.quotationId === quotationId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findByInvoiceId(invoiceId: string): Promise<StoredOnboardingPayment[]> {
    return [...this.payments.values()]
      .filter((payment) => payment.invoiceId === invoiceId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findReusablePending(
    applicationId: string,
    amountKobo: number,
    planCode: string,
    createdSince: Date,
  ): Promise<StoredOnboardingPayment | null> {
    return (
      [...this.payments.values()]
        .filter(
          (payment) =>
            payment.applicationId === applicationId &&
            payment.status === 'pending' &&
            payment.amountKobo === amountKobo &&
            payment.planCode === planCode &&
            payment.authorizationUrl !== null &&
            payment.createdAt >= createdSince,
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
    );
  }

  async setAuthorizationUrl(
    id: string,
    authorizationUrl: string | null,
  ): Promise<void> {
    const payment = this.payments.get(id);
    if (payment) payment.authorizationUrl = authorizationUrl;
  }

  async settlePending(
    id: string,
    status: Exclude<OnboardingPaymentStatus, 'pending'>,
    paidAt: Date | null,
    details: SettleDetails = { method: null, autoReconciled: true },
  ): Promise<boolean> {
    const payment = this.payments.get(id);
    const from = status === 'paid' ? ['pending', 'failed', 'mismatch'] : ['pending'];
    if (!payment || !from.includes(payment.status)) return false;
    if (status === 'paid' && payment.refundPendingAt) return false;
    payment.status = status;
    payment.paidAt = paidAt;
    payment.method = details.method;
    payment.autoReconciled = details.autoReconciled;
    payment.receivedAmountKobo =
      details.receivedAmountKobo ?? payment.receivedAmountKobo ?? null;
    payment.receivedCurrency =
      details.receivedCurrency ?? payment.receivedCurrency ?? null;
    payment.updatedAt = new Date();
    return true;
  }

  async reviewMismatch(id: string, review: MismatchReview): Promise<boolean> {
    const payment = this.payments.get(id);
    if (payment?.status !== 'mismatch') return false;
    payment.reviewOutcome = review.outcome;
    payment.reviewNote = review.note;
    payment.reviewedBy = review.reviewedBy;
    payment.reviewedAt = review.reviewedAt;
    payment.updatedAt = new Date();
    return true;
  }

  async claimRefund(id: string, claim: RefundClaim): Promise<boolean> {
    const payment = this.payments.get(id);
    if (payment?.status !== 'mismatch' || payment.reviewOutcome !== 'refund_needed') return false;
    if (payment.refundPendingAt) return false;
    payment.refundPendingAt = new Date();
    payment.refundNote = claim.note;
    payment.refundRequestedBy = claim.requestedBy;
    payment.refundError = null;
    return true;
  }

  async recordRefundAccepted(id: string, providerRefundId: string | null): Promise<void> {
    const payment = this.payments.get(id);
    if (payment?.status !== 'mismatch') return;
    payment.refundReference = providerRefundId;
    payment.updatedAt = new Date();
  }

  async flagForReview(id: string, note: string): Promise<void> {
    const payment = this.payments.get(id);
    if (payment) payment.refundError = note.slice(0, 500);
  }

  async markRefunded(id: string, refund: RefundRecord): Promise<boolean> {
    const payment = this.payments.get(id);
    if (payment?.status !== 'mismatch') return false;
    payment.status = 'refunded';
    payment.refundedAt = refund.refundedAt;
    payment.refundReference = refund.refundReference;
    payment.refundError = null;
    payment.refundPendingAt = null;
    payment.updatedAt = new Date();
    return true;
  }

  async recordRefundError(id: string, error: string, onlyIfClaimedBefore?: Date): Promise<void> {
    const payment = this.payments.get(id);
    if (payment?.status !== 'mismatch') return;
    if (onlyIfClaimedBefore && !(payment.refundPendingAt && payment.refundPendingAt < onlyIfClaimedBefore)) return;
    payment.refundError = error.slice(0, 500);
    payment.refundPendingAt = null;
  }

  async linkInvoice(id: string, invoiceId: string): Promise<void> {
    const payment = this.payments.get(id);
    if (payment && payment.invoiceId === null) payment.invoiceId = invoiceId;
  }

  async deleteUnstarted(id: string): Promise<void> {
    const payment = this.payments.get(id);
    if (payment?.status === 'pending' && payment.authorizationUrl === null) {
      this.payments.delete(id);
    }
  }

  async deleteForApplication(applicationId: string): Promise<void> {
    for (const [id, payment] of this.payments) {
      if (payment.applicationId === applicationId) this.payments.delete(id);
    }
  }
}
