import { Inject, Injectable, Logger } from '@nestjs/common';
import { SYSTEM_TENANT_ID } from '@shared/identity';
import { ID_GENERATOR, type IdGenerator } from '@auth/session/domain/ports/id-generator.port';
import {
  BILLING_SETTINGS_REPOSITORY,
  type BillingSettingsRepository,
} from '@auth/onboarding/domain/billing-settings.repository';
import { addDaysToDate, lagosDate } from '@auth/onboarding/domain/invoice-dates';
import {
  INVOICE_REPOSITORY,
  settledInvoiceStatus,
  type InvoiceRepository,
  type InvoiceWithLines,
} from '@auth/onboarding/domain/invoice.repository';
import {
  ONBOARDING_PAYMENT_REPOSITORY,
  type OnboardingPaymentRepository,
  type StoredOnboardingPayment,
} from '@auth/onboarding/domain/onboarding-payment.repository';
import {
  BILLING_AUDIT,
  type BillingActor,
  type BillingAudit,
} from '@auth/onboarding/domain/ports/billing-audit.port';
import {
  INVOICE_NOTIFIER,
  type InvoiceNotifier,
} from '@auth/onboarding/domain/ports/invoice-notifier.port';
import {
  INVOICE_NUMBER_ALLOCATOR,
  type InvoiceNumberAllocator,
} from '@auth/onboarding/domain/ports/invoice-number.port';
import {
  QUOTATION_REPOSITORY,
  type QuotationRepository,
  type QuotationWithLines,
} from '@auth/onboarding/domain/quotation.repository';
import { koboToNgn } from '@auth/onboarding/domain/quotation-totals';
import { loadInvoiceDueDays } from '../use-cases/support/billing-terms';

/** A paid row this young may still be mid-settlement on another delivery. */
const REPAIR_GRACE_MS = 60_000;

const SYSTEM_ACTOR: BillingActor = {
  userId: 'system',
  name: 'Payment settlement',
  email: null,
  role: 'system',
  tenantId: SYSTEM_TENANT_ID,
};

@Injectable()
export class InvoiceIssuanceService {
  private readonly logger = new Logger(InvoiceIssuanceService.name);

  constructor(
    @Inject(QUOTATION_REPOSITORY) private readonly quotations: QuotationRepository,
    @Inject(INVOICE_REPOSITORY) private readonly invoices: InvoiceRepository,
    @Inject(ONBOARDING_PAYMENT_REPOSITORY)
    private readonly payments: OnboardingPaymentRepository,
    @Inject(BILLING_SETTINGS_REPOSITORY) private readonly settings: BillingSettingsRepository,
    @Inject(INVOICE_NUMBER_ALLOCATOR) private readonly numbers: InvoiceNumberAllocator,
    @Inject(INVOICE_NOTIFIER) private readonly notifier: InvoiceNotifier,
    @Inject(BILLING_AUDIT) private readonly audit: BillingAudit,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  /** Called once, by the delivery that moved the payment to paid. */
  async paymentReceived(payment: StoredOnboardingPayment, now: Date): Promise<void> {
    await this.log('system.billing.payment_received', 'payment', payment.id, {
      summary: `Payment ${payment.reference} received`,
      reference: payment.reference,
      amountKobo: payment.amountKobo,
      quotationId: payment.quotationId,
    });
    await this.issueFor(payment, now);
  }

  /** Finishes a settlement an earlier delivery started and did not complete. */
  async repair(payment: StoredOnboardingPayment, now: Date): Promise<void> {
    if (payment.invoiceId || !payment.quotationId) return;
    const settledAt = payment.paidAt?.getTime() ?? 0;
    if (now.getTime() - settledAt < REPAIR_GRACE_MS) return;
    await this.issueFor(payment, now);
  }

  private async issueFor(payment: StoredOnboardingPayment, now: Date): Promise<void> {
    if (!payment.quotationId) return;
    const quotation = await this.quotations.findById(payment.quotationId);
    if (!quotation) return;

    const { invoice, created } = await this.ensureInvoice(quotation, now);
    if (await this.quotations.markAccepted(quotation.id, now)) {
      await this.log('system.billing.quotation_accepted', 'quotation', quotation.id, {
        summary: `Quotation ${quotation.number} accepted`,
        number: quotation.number,
      });
    }
    await this.invoices.recomputePaid(invoice.id);
    await this.payments.linkInvoice(payment.id, invoice.id);

    if (!created) return;
    await this.log('system.billing.invoice_issued', 'invoice', invoice.id, {
      summary: `Invoice ${invoice.number} issued`,
      number: invoice.number,
      quotationId: quotation.id,
      totalKobo: invoice.totalKobo,
    });
    await this.email(invoice.id);
  }

  private async ensureInvoice(quotation: QuotationWithLines, now: Date) {
    const existing = await this.invoices.findByQuotationId(quotation.id);
    if (existing) return { invoice: existing, created: false };
    return this.invoices.createIfAbsent(await this.build(quotation, now));
  }

  private async build(quotation: QuotationWithLines, now: Date): Promise<InvoiceWithLines> {
    const id = this.idGenerator.generate();
    const allocated = await this.numbers.next(now);
    const issueDate = lagosDate(now);
    const dueDays = await loadInvoiceDueDays(this.settings);
    const paidKobo = await this.successfulKobo(quotation.id);

    return {
      id,
      number: allocated.number,
      prefix: allocated.prefix,
      year: allocated.year,
      sequence: allocated.sequence,
      quotationId: quotation.id,
      applicationId: quotation.applicationId,
      tenantId: quotation.tenantId,
      customerName: quotation.customerName,
      customerType: quotation.customerType,
      billingEmail: quotation.billingEmail,
      status: settledInvoiceStatus(quotation.totalKobo, paidKobo),
      issueDate,
      dueDate: addDaysToDate(issueDate, dueDays),
      subtotalKobo: quotation.subtotalKobo,
      discountKobo: quotation.discountKobo,
      taxRateBp: quotation.taxRateBp,
      taxKobo: quotation.taxKobo,
      totalKobo: quotation.totalKobo,
      amountPaidKobo: paidKobo,
      emailedAt: null,
      createdAt: now,
      updatedAt: now,
      lines: quotation.lines.map(({ quotationId: _quotationId, ...line }) => ({
        ...line,
        id: this.idGenerator.generate(),
        invoiceId: id,
      })),
    };
  }

  private async successfulKobo(quotationId: string): Promise<number> {
    const payments = await this.payments.findByQuotationId(quotationId);
    return payments
      .filter((payment) => payment.status === 'paid')
      .reduce((sum, payment) => sum + payment.amountKobo, 0);
  }

  private async email(invoiceId: string): Promise<void> {
    try {
      const invoice = await this.invoices.findById(invoiceId);
      if (!invoice) return;
      await this.notifier.sendInvoice({
        email: invoice.billingEmail,
        customerName: invoice.customerName,
        invoiceNumber: invoice.number,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        totalNgn: koboToNgn(invoice.totalKobo),
        amountPaidNgn: koboToNgn(invoice.amountPaidKobo),
        outstandingNgn: koboToNgn(Math.max(invoice.totalKobo - invoice.amountPaidKobo, 0)),
      });
      await this.invoices.markEmailed(invoiceId, new Date());
    } catch (error) {
      this.logger.warn(
        `invoice_email_failed:${invoiceId}:${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  private async log(
    action: string,
    entityType: string,
    entityId: string,
    metadata: Record<string, unknown> & { summary: string },
  ): Promise<void> {
    const { summary, ...rest } = metadata;
    try {
      await this.audit.record(SYSTEM_ACTOR, { action, entityType, entityId, summary, metadata: rest });
    } catch (error) {
      this.logger.warn(
        `billing_audit_failed:${action}:${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }
}
