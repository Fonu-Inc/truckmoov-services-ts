import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';
import {
  isOnboardingPayment,
  isRenewalReference,
  type MismatchReview,
  type MismatchReviewOutcome,
  type OnboardingPaymentRepository,
  type OnboardingPaymentStatus,
  type RefundClaim,
  type RefundRecord,
  type SettleDetails,
  type StoredOnboardingPayment,
} from '@auth/onboarding/domain/onboarding-payment.repository';
import type { OnboardingOrderSummary } from '@auth/onboarding/domain/onboarding-order';
import type { PaymentMethod } from '@auth/onboarding/domain/payment-method';
import { OnboardingPaymentRecord } from './onboarding-orm';

function toStored(r: OnboardingPaymentRecord): StoredOnboardingPayment {
  return {
    id: r.id,
    applicationId: r.applicationId,
    tenantId: r.tenantId ?? null,
    reference: r.reference,
    provider: r.provider,
    amountKobo: Number(r.amountKobo),
    authorizationUrl: r.authorizationUrl ?? null,
    billingEmail: r.billingEmail,
    planCode: r.planCode,
    deviceCount: r.deviceCount,
    orderSummary: (r.orderSummary as OnboardingOrderSummary | null) ?? null,
    quotationId: r.quotationId ?? null,
    invoiceId: r.invoiceId ?? null,
    method: (r.method as PaymentMethod | null) ?? null,
    customerName: r.customerName ?? null,
    note: r.note ?? null,
    autoReconciled: r.autoReconciled ?? true,
    status: r.status as StoredOnboardingPayment['status'],
    paidAt: r.paidAt ?? null,
    receivedAmountKobo:
      r.receivedAmountKobo === null || r.receivedAmountKobo === undefined
        ? null
        : Number(r.receivedAmountKobo),
    receivedCurrency: r.receivedCurrency ?? null,
    reviewOutcome: (r.reviewOutcome as MismatchReviewOutcome | null) ?? null,
    reviewNote: r.reviewNote ?? null,
    reviewedBy: r.reviewedBy ?? null,
    reviewedAt: r.reviewedAt ?? null,
    refundedAt: r.refundedAt ?? null,
    refundReference: r.refundReference ?? null,
    refundError: r.refundError ?? null,
    refundPendingAt: r.refundPendingAt ?? null,
    refundNote: r.refundNote ?? null,
    refundRequestedBy: r.refundRequestedBy ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

@Injectable()
export class MikroOnboardingPaymentRepository
  implements OnboardingPaymentRepository
{
  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  private async em() {
    const orm = await getAuthOrm(this.config.db);
    return orm.em.fork();
  }

  async save(payment: StoredOnboardingPayment): Promise<void> {
    const em = await this.em();
    const existing = await em.findOne(OnboardingPaymentRecord, {
      id: payment.id,
    });
    const target = existing ?? new OnboardingPaymentRecord();
    Object.assign(target, payment);
    if (!existing) em.persist(target);
    await em.flush();
  }

  async findByReference(
    reference: string,
  ): Promise<StoredOnboardingPayment | null> {
    const em = await this.em();
    const record = await em.findOne(OnboardingPaymentRecord, { reference });
    return record ? toStored(record) : null;
  }

  async findLatestForApplication(
    applicationId: string,
  ): Promise<StoredOnboardingPayment | null> {
    const em = await this.em();
    const record = await em.findOne(
      OnboardingPaymentRecord,
      { applicationId, reference: { $not: { $like: 'RNW-%' } } },
      { orderBy: { createdAt: 'desc' } },
    );
    return record ? toStored(record) : null;
  }

  async findPaidForApplication(applicationId: string): Promise<StoredOnboardingPayment | null> {
    const em = await this.em();
    const record = await em.findOne(OnboardingPaymentRecord, {
      applicationId,
      status: 'paid',
      reference: { $not: { $like: 'RNW-%' } },
    });
    return record ? toStored(record) : null;
  }

  async findWalletRenewalAttempts(createdFrom: Date, createdBefore: Date): Promise<StoredOnboardingPayment[]> {
    const em = await this.em();
    const records = await em.find(OnboardingPaymentRecord, {
      reference: { $like: 'RNW-W-%' },
      status: { $in: ['pending', 'paid'] },
      createdAt: { $gte: createdFrom, $lt: createdBefore },
    });
    return records.map(toStored);
  }

  async findStaleRefundClaims(claimedBefore: Date, limit: number): Promise<StoredOnboardingPayment[]> {
    const em = await this.em();
    const records = await em.find(
      OnboardingPaymentRecord,
      { status: 'mismatch', refundPendingAt: { $lt: claimedBefore } },
      { orderBy: { refundPendingAt: 'asc' }, limit },
    );
    return records.map(toStored).filter((payment) => !isRenewalReference(payment.reference) && !payment.invoiceId);
  }

  async listMismatchedForApplication(
    applicationId: string,
    includeRefunded = false,
  ): Promise<StoredOnboardingPayment[]> {
    const em = await this.em();
    const records = await em.find(
      OnboardingPaymentRecord,
      { applicationId, status: { $in: includeRefunded ? ['mismatch', 'refunded'] : ['mismatch'] } },
      { orderBy: { createdAt: 'desc' } },
    );
    return records.map(toStored).filter(isOnboardingPayment);
  }

  async findByQuotationId(
    quotationId: string,
  ): Promise<StoredOnboardingPayment[]> {
    const em = await this.em();
    const records = await em.find(
      OnboardingPaymentRecord,
      { quotationId },
      { orderBy: { createdAt: 'desc' } },
    );
    return records.map(toStored);
  }

  async findByInvoiceId(invoiceId: string): Promise<StoredOnboardingPayment[]> {
    const em = await this.em();
    const records = await em.find(
      OnboardingPaymentRecord,
      { invoiceId },
      { orderBy: { createdAt: 'desc' } },
    );
    return records.map(toStored);
  }

  async findReusablePending(
    applicationId: string,
    amountKobo: number,
    planCode: string,
    createdSince: Date,
  ): Promise<StoredOnboardingPayment | null> {
    const em = await this.em();
    const record = await em.findOne(
      OnboardingPaymentRecord,
      {
        applicationId,
        status: 'pending',
        amountKobo,
        planCode,
        authorizationUrl: { $ne: null },
        createdAt: { $gte: createdSince },
      },
      { orderBy: { createdAt: 'desc' } },
    );
    return record ? toStored(record) : null;
  }

  async setAuthorizationUrl(
    id: string,
    authorizationUrl: string | null,
  ): Promise<void> {
    const em = await this.em();
    await em.nativeUpdate(
      OnboardingPaymentRecord,
      { id },
      { authorizationUrl },
    );
  }

  async settlePending(
    id: string,
    status: Exclude<OnboardingPaymentStatus, 'pending'>,
    paidAt: Date | null,
    details: SettleDetails = { method: null, autoReconciled: true },
  ): Promise<boolean> {
    const from = status === 'paid' ? ['pending', 'failed', 'mismatch'] : ['pending'];
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em.getConnection().execute<Array<{ id: string }>>(
      `update onboarding_payments
         set status = ?, paid_at = ?, method = ?, auto_reconciled = ?,
             received_amount_kobo = coalesce(?, received_amount_kobo),
             received_currency = coalesce(?, received_currency),
             updated_at = now()
       where id = ? and status in (${from.map(() => '?').join(', ')})${
         status === 'paid' ? ' and refund_pending_at is null' : ''
       }
       returning id`,
      [
        status,
        paidAt,
        details.method,
        details.autoReconciled,
        details.receivedAmountKobo ?? null,
        details.receivedCurrency ?? null,
        id,
        ...from,
      ],
    );
    return rows.length === 1;
  }

  async reviewMismatch(id: string, review: MismatchReview): Promise<boolean> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em.getConnection().execute<Array<{ id: string }>>(
      `update onboarding_payments
         set review_outcome = ?, review_note = ?, reviewed_by = ?, reviewed_at = ?, updated_at = now()
       where id = ? and status = 'mismatch'
       returning id`,
      [review.outcome, review.note, review.reviewedBy, review.reviewedAt, id],
    );
    return rows.length === 1;
  }

  async claimRefund(id: string, claim: RefundClaim): Promise<boolean> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em.getConnection().execute<Array<{ id: string }>>(
      `update onboarding_payments
         set refund_pending_at = now(), refund_note = ?, refund_requested_by = ?, refund_error = null, updated_at = now()
       where id = ? and status = 'mismatch' and review_outcome = 'refund_needed' and refund_pending_at is null
       returning id`,
      [claim.note, claim.requestedBy, id],
    );
    return rows.length === 1;
  }

  async recordRefundAccepted(id: string, providerRefundId: string | null): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    await orm.em.getConnection().execute(
      `update onboarding_payments set refund_reference = ?, updated_at = now()
       where id = ? and status = 'mismatch'`,
      [providerRefundId, id],
    );
  }

  async flagForReview(id: string, note: string): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    await orm.em.getConnection().execute(
      `update onboarding_payments set refund_error = ?, updated_at = now() where id = ?`,
      [note.slice(0, 500), id],
    );
  }

  async markRefunded(id: string, refund: RefundRecord): Promise<boolean> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em.getConnection().execute<Array<{ id: string }>>(
      `update onboarding_payments
         set status = 'refunded', refunded_at = ?, refund_reference = ?, refund_error = null, refund_pending_at = null, updated_at = now()
       where id = ? and status = 'mismatch'
       returning id`,
      [refund.refundedAt, refund.refundReference, id],
    );
    return rows.length === 1;
  }

  async recordRefundError(id: string, error: string, onlyIfClaimedBefore?: Date): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    await orm.em.getConnection().execute(
      `update onboarding_payments set refund_error = ?, refund_pending_at = null, updated_at = now()
       where id = ? and status = 'mismatch'${onlyIfClaimedBefore ? ' and refund_pending_at < ?' : ''}`,
      onlyIfClaimedBefore ? [error.slice(0, 500), id, onlyIfClaimedBefore] : [error.slice(0, 500), id],
    );
  }

  async linkInvoice(id: string, invoiceId: string): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    await orm.em.getConnection().execute(
      `update onboarding_payments
         set invoice_id = ?, updated_at = now()
       where id = ? and invoice_id is null`,
      [invoiceId, id],
    );
  }

  async deleteUnstarted(id: string): Promise<void> {
    const em = await this.em();
    await em.nativeDelete(OnboardingPaymentRecord, {
      id,
      status: 'pending',
      authorizationUrl: null,
    });
  }

  async deleteForApplication(applicationId: string): Promise<void> {
    const em = await this.em();
    await em.nativeDelete(OnboardingPaymentRecord, { applicationId });
  }
}
