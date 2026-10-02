import { Injectable } from '@nestjs/common';
import type {
  MismatchReview,
  OnboardingPaymentRepository,
  OnboardingPaymentStatus,
  SettleDetails,
  StoredOnboardingPayment,
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
        .filter((payment) => payment.applicationId === applicationId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
    );
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
