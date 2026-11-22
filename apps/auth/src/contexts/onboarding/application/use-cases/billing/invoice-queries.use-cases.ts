import { Inject, Injectable, Optional } from '@nestjs/common';
import { BillingNotFoundError, BillingValidationError } from '@auth/onboarding/domain/billing-errors';
import { clampPage } from '@auth/onboarding/domain/billing-pricing';
import { lagosDate } from '@auth/onboarding/domain/invoice-dates';
import {
  INVOICE_REPOSITORY,
  INVOICE_STATUSES,
  isRenewalInvoice,
  type InvoiceKind,
  type InvoiceRepository,
  type InvoiceStatus,
} from '@auth/onboarding/domain/invoice.repository';
import {
  LICENCE_PERIOD_REPOSITORY,
  type LicencePeriodRepository,
} from '@auth/onboarding/domain/licence-period.repository';
import {
  ONBOARDING_PAYMENT_REPOSITORY,
  type OnboardingPaymentRepository,
} from '@auth/onboarding/domain/onboarding-payment.repository';
import { success } from './billing-views';
import { toInvoiceDetailView, toInvoiceRowView } from './invoice-views';

export type ListInvoicesInput = {
  q?: string;
  status?: string;
  kind?: string;
  page?: number;
  limit?: number;
};

function parseStatus(value?: string): InvoiceStatus | undefined {
  if (!value) return undefined;
  if (!(INVOICE_STATUSES as readonly string[]).includes(value)) {
    throw new BillingValidationError('status', 'status is not an invoice status');
  }
  return value as InvoiceStatus;
}

function parseKind(value?: string): InvoiceKind | undefined {
  if (!value) return undefined;
  if (value !== 'renewal' && value !== 'first') {
    throw new BillingValidationError('kind', 'kind must be renewal or first');
  }
  return value;
}

@Injectable()
export class ListInvoicesUseCase {
  constructor(
    @Inject(INVOICE_REPOSITORY) private readonly invoices: InvoiceRepository,
    @Optional()
    @Inject(LICENCE_PERIOD_REPOSITORY)
    private readonly periods?: LicencePeriodRepository,
  ) {}

  async execute(input: ListInvoicesInput, now = new Date()) {
    const paging = clampPage(input.page, input.limit);
    const today = lagosDate(now);
    const { items, total } = await this.invoices.list({
      q: input.q?.trim() || undefined,
      status: parseStatus(input.status),
      kind: parseKind(input.kind),
      today,
      ...paging,
    });
    const ends = (await this.periods?.periodEndsForInvoices(items.map((row) => row.invoice.id))) ?? new Map();
    return success({
      items: items.map((row) =>
        toInvoiceRowView(
          row.invoice,
          row.quotationNumber,
          today,
          { isRenewal: row.isRenewal, periodEnd: ends.get(row.invoice.id) ?? null },
          { productName: row.productName, deviceCount: row.deviceCount },
        ),
      ),
      total,
      ...paging,
    });
  }
}

@Injectable()
export class GetInvoiceUseCase {
  constructor(
    @Inject(INVOICE_REPOSITORY) private readonly invoices: InvoiceRepository,
    @Inject(ONBOARDING_PAYMENT_REPOSITORY)
    private readonly payments: OnboardingPaymentRepository,
    @Optional()
    @Inject(LICENCE_PERIOD_REPOSITORY)
    private readonly periods?: LicencePeriodRepository,
  ) {}

  async execute(id: string, now = new Date()) {
    const invoice = await this.invoices.findById(id);
    if (!invoice) throw new BillingNotFoundError('Invoice not found');
    const [quotationNumber, payments] = await Promise.all([
      this.invoices.findQuotationNumber(invoice.id),
      this.payments.findByInvoiceId(invoice.id),
    ]);
    const period = await this.periods?.findByRenewalInvoiceId(invoice.id);
    const renewal = { isRenewal: isRenewalInvoice(invoice), periodEnd: period?.periodEnd ?? null };
    return success(toInvoiceDetailView(invoice, quotationNumber, payments, lagosDate(now), renewal));
  }
}
