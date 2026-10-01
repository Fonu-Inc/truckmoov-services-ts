import { Inject, Injectable } from '@nestjs/common';
import { BillingNotFoundError, BillingValidationError } from '@auth/onboarding/domain/billing-errors';
import { clampPage } from '@auth/onboarding/domain/billing-pricing';
import { lagosDate } from '@auth/onboarding/domain/invoice-dates';
import {
  INVOICE_REPOSITORY,
  INVOICE_STATUSES,
  type InvoiceRepository,
  type InvoiceStatus,
} from '@auth/onboarding/domain/invoice.repository';
import {
  ONBOARDING_PAYMENT_REPOSITORY,
  type OnboardingPaymentRepository,
} from '@auth/onboarding/domain/onboarding-payment.repository';
import { success } from './billing-views';
import { toInvoiceDetailView, toInvoiceRowView } from './invoice-views';

export type ListInvoicesInput = {
  q?: string;
  status?: string;
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

@Injectable()
export class ListInvoicesUseCase {
  constructor(@Inject(INVOICE_REPOSITORY) private readonly invoices: InvoiceRepository) {}

  async execute(input: ListInvoicesInput, now = new Date()) {
    const paging = clampPage(input.page, input.limit);
    const today = lagosDate(now);
    const { items, total } = await this.invoices.list({
      q: input.q?.trim() || undefined,
      status: parseStatus(input.status),
      today,
      ...paging,
    });
    return success({
      items: items.map((row) => toInvoiceRowView(row.invoice, row.quotationNumber, today)),
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
  ) {}

  async execute(id: string, now = new Date()) {
    const invoice = await this.invoices.findById(id);
    if (!invoice) throw new BillingNotFoundError('Invoice not found');
    const [quotationNumber, payments] = await Promise.all([
      this.invoices.findQuotationNumber(invoice.id),
      this.payments.findByInvoiceId(invoice.id),
    ]);
    return success(toInvoiceDetailView(invoice, quotationNumber, payments, lagosDate(now)));
  }
}
