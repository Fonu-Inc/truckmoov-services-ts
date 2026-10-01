import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PaidAmount } from '../../payments';
import { lagosDate } from '@auth/onboarding/domain/invoice-dates';
import {
  INVOICE_REPOSITORY,
  isRenewalInvoice,
  type InvoiceRepository,
  type InvoiceWithLines,
} from '@auth/onboarding/domain/invoice.repository';
import {
  DUPLICATE_PAYMENT_NOTE,
  LICENCE_PERIOD_REPOSITORY,
  type LicencePeriodRepository,
  type RenewalSettlement,
} from '@auth/onboarding/domain/licence-period.repository';
import {
  ONBOARDING_PAYMENT_REPOSITORY,
  type OnboardingPaymentRepository,
  type StoredOnboardingPayment,
} from '@auth/onboarding/domain/onboarding-payment.repository';
import { methodFromChannel } from '@auth/onboarding/domain/payment-method';
import { koboToNgn } from '@auth/onboarding/domain/quotation-totals';
import { EnforcementRestoreService } from '../../../enforcement-restore.service';
import { PaymentEventService } from '../../../payment-event.service';
import { RenewalAudit } from '../../../renewal-audit';
import { TENANT_WALLET_REPOSITORY, type TenantWalletRepository } from '../../../tenant-wallet.repository';
import { paidInFull } from './use-cases/pay-for-application.use-cases';

export type SettleRenewalInput = {
  reference: string;
  /** Present only for a provider callback; a wallet payment is already paid. */
  gateway?: { succeeded: boolean; paid: PaidAmount };
};

export type SettleRenewalResult = {
  outcome: 'noop' | 'failed' | 'mismatch' | RenewalSettlement['outcome'];
  tenantId: string | null;
  newPeriodEnd: string | null;
};

const RETRYABLE: readonly string[] = ['pending', 'failed', 'mismatch'];

const NOOP: SettleRenewalResult = { outcome: 'noop', tenantId: null, newPeriodEnd: null };

@Injectable()
export class SettleRenewalPaymentUseCase {
  private readonly logger = new Logger(SettleRenewalPaymentUseCase.name);

  constructor(
    @Inject(ONBOARDING_PAYMENT_REPOSITORY) private readonly payments: OnboardingPaymentRepository,
    @Inject(INVOICE_REPOSITORY) private readonly invoices: InvoiceRepository,
    @Inject(LICENCE_PERIOD_REPOSITORY) private readonly periods: LicencePeriodRepository,
    @Inject(TENANT_WALLET_REPOSITORY) private readonly wallet: TenantWalletRepository,
    @Inject(RenewalAudit) private readonly audit: RenewalAudit,
    @Inject(PaymentEventService) private readonly events: PaymentEventService,
    @Inject(EnforcementRestoreService) private readonly restore: EnforcementRestoreService,
  ) {}

  async execute(input: SettleRenewalInput, now: Date = new Date()): Promise<SettleRenewalResult> {
    const payment = await this.payments.findByReference(input.reference);
    if (!payment?.invoiceId) return NOOP;
    const invoice = await this.invoices.findById(payment.invoiceId);
    if (!invoice?.tenantId || !isRenewalInvoice(invoice)) return NOOP;
    const tenantId = invoice.tenantId;

    if (payment.status === 'refunded' && payment.note === DUPLICATE_PAYMENT_NOTE) {
      await this.creditDuplicate(invoice, payment, 'duplicate');
      return this.finish({ outcome: 'duplicate' }, tenantId);
    }
    const gatewayStop = input.gateway ? await this.applyGateway(payment, input.gateway, now) : null;
    if (gatewayStop) return { outcome: gatewayStop, tenantId, newPeriodEnd: null };

    const settlement = await this.periods.settleRenewalPayment({
      invoiceId: invoice.id,
      paymentId: payment.id,
      today: lagosDate(now),
    });
    if (settlement.outcome === 'not_applicable') return { ...NOOP, tenantId };
    await this.afterCommit(settlement, invoice, payment, tenantId);
    return this.finish(settlement, tenantId);
  }

  private async applyGateway(
    payment: StoredOnboardingPayment,
    gateway: NonNullable<SettleRenewalInput['gateway']>,
    now: Date,
  ): Promise<'failed' | 'mismatch' | 'noop' | null> {
    if (payment.status === 'paid') return null;
    if (gateway.succeeded && !RETRYABLE.includes(payment.status)) return 'noop';
    const method = { method: methodFromChannel(gateway.paid.channel), autoReconciled: true };
    if (!gateway.succeeded) {
      await this.payments.settlePending(payment.id, 'failed', null, method);
      return 'failed';
    }
    if (!paidInFull(payment.amountKobo, gateway.paid)) {
      await this.payments.settlePending(payment.id, 'mismatch', null, { ...method, autoReconciled: false });
      this.logger.error(
        `renewal_payment_mismatch:${payment.reference}:expected=${payment.amountKobo}:paid=${gateway.paid.amountKobo ?? 'unknown'}`,
      );
      return 'mismatch';
    }
    await this.payments.settlePending(payment.id, 'paid', now, { ...method, method: method.method ?? 'other' });
    return null;
  }

  private async afterCommit(
    settlement: RenewalSettlement,
    invoice: InvoiceWithLines,
    payment: StoredOnboardingPayment,
    tenantId: string,
  ): Promise<void> {
    if (settlement.outcome === 'duplicate') {
      await this.creditDuplicate(invoice, payment, settlement.reason);
      return;
    }
    if (settlement.outcome !== 'renewed') return;
    const paid = await this.payments.findByReference(payment.reference);
    await this.audit.paid({
      invoiceId: invoice.id,
      number: invoice.number,
      tenantId,
      paymentReference: payment.reference,
      method: paid?.method ?? payment.method,
      newPeriodEnd: settlement.newPeriodEnd,
    });
    await this.audit.licenceRenewed({
      tenantId,
      invoiceNumber: invoice.number,
      newPeriodEnd: settlement.newPeriodEnd,
    });
    this.events.emit(tenantId, { event: 'payment.confirmed', reference: payment.reference });
  }

  private async creditDuplicate(
    invoice: InvoiceWithLines,
    payment: StoredOnboardingPayment,
    reason: 'duplicate' | 'invoice_closed',
  ): Promise<void> {
    const tenantId = invoice.tenantId as string;
    await this.wallet.ensure(tenantId);
    const credited = await this.wallet.credit(tenantId, payment.amountKobo, {
      category: 'refund',
      quantity: 1,
      unitRateKobo: payment.amountKobo,
      reason: `Refund: extra payment for invoice ${invoice.number}`,
      reference: payment.reference,
      idempotencyKey: `renewal-dup:${payment.reference}`,
    });
    if (!credited.ok) throw new Error(`Extra payment ${payment.reference} could not be credited`);
    if (credited.replayed) return;
    await this.audit.duplicatePayment({
      invoiceId: invoice.id,
      number: invoice.number,
      tenantId,
      paymentReference: payment.reference,
      amountNgn: koboToNgn(payment.amountKobo),
      reason,
    });
  }

  private finish(settlement: RenewalSettlement | { outcome: 'duplicate' }, tenantId: string): SettleRenewalResult {
    void this.restore.onPaymentSettled(tenantId, 'invoice_paid');
    const newPeriodEnd = 'newPeriodEnd' in settlement ? settlement.newPeriodEnd : null;
    return { outcome: settlement.outcome, tenantId, newPeriodEnd };
  }
}
