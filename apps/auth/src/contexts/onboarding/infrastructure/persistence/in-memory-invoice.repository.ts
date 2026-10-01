import { Inject, Injectable } from '@nestjs/common';
import {
  ONBOARDING_PAYMENT_REPOSITORY,
  type OnboardingPaymentRepository,
} from '@auth/onboarding/domain/onboarding-payment.repository';
import {
  QUOTATION_REPOSITORY,
  type QuotationRepository,
} from '@auth/onboarding/domain/quotation.repository';
import {
  effectiveInvoiceStatus,
  settledInvoiceStatus,
  invoiceOverdue,
  type InvoiceListFilter,
  type InvoiceListRow,
  type InvoiceRepository,
  type InvoiceWithLines,
} from '@auth/onboarding/domain/invoice.repository';

function copy(invoice: InvoiceWithLines): InvoiceWithLines {
  return { ...invoice, lines: invoice.lines.map((line) => ({ ...line })) };
}

@Injectable()
export class InMemoryInvoiceRepository implements InvoiceRepository {
  private readonly invoices = new Map<string, InvoiceWithLines>();

  constructor(
    @Inject(ONBOARDING_PAYMENT_REPOSITORY)
    private readonly payments: OnboardingPaymentRepository,
    @Inject(QUOTATION_REPOSITORY)
    private readonly quotations: QuotationRepository,
  ) {}

  async findByQuotationId(quotationId: string): Promise<InvoiceWithLines | null> {
    return this.byQuotation(quotationId);
  }

  private byQuotation(quotationId: string): InvoiceWithLines | null {
    const found = [...this.invoices.values()].find((i) => i.quotationId === quotationId);
    return found ? copy(found) : null;
  }

  async createIfAbsent(invoice: InvoiceWithLines) {
    const existing = invoice.quotationId ? this.byQuotation(invoice.quotationId) : null;
    if (existing) return { invoice: existing, created: false };
    this.invoices.set(invoice.id, copy(invoice));
    return { invoice: copy(invoice), created: true };
  }

  async recomputePaid(invoiceId: string): Promise<void> {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) return;
    const linked = await this.payments.findByInvoiceId(invoiceId);
    const quoted = invoice.quotationId
      ? await this.payments.findByQuotationId(invoice.quotationId)
      : [];
    const successful = new Map(
      [...linked, ...quoted]
        .filter((payment) => payment.status === 'paid')
        .map((payment) => [payment.id, payment.amountKobo]),
    );
    const paid = [...successful.values()].reduce((sum, amount) => sum + amount, 0);
    invoice.amountPaidKobo = paid;
    if (invoice.status !== 'draft' && invoice.status !== 'cancelled') {
      invoice.status = paid > 0 ? settledInvoiceStatus(invoice.totalKobo, paid) : 'issued';
    }
    invoice.updatedAt = new Date();
  }

  async markEmailed(id: string, at: Date): Promise<boolean> {
    const invoice = this.invoices.get(id);
    if (!invoice || invoice.emailedAt) return false;
    invoice.emailedAt = at;
    return true;
  }

  async findById(id: string): Promise<InvoiceWithLines | null> {
    const found = this.invoices.get(id);
    return found ? copy(found) : null;
  }

  async findQuotationNumber(invoiceId: string): Promise<string | null> {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice?.quotationId) return null;
    return (await this.quotations.findById(invoice.quotationId))?.number ?? null;
  }

  async list(filter: InvoiceListFilter) {
    const rows: InvoiceListRow[] = await Promise.all(
      [...this.invoices.values()].map(async (invoice) => {
        const { lines: _lines, ...header } = copy(invoice);
        return { invoice: header, quotationNumber: await this.findQuotationNumber(invoice.id) };
      }),
    );
    const needle = filter.q?.trim().toLowerCase();
    const matching = rows
      .filter(({ invoice, quotationNumber }) => {
        if (filter.status && effectiveInvoiceStatus(invoice, filter.today) !== filter.status) {
          return false;
        }
        if (!needle) return true;
        return [invoice.number, invoice.customerName, quotationNumber ?? '']
          .some((field) => field.toLowerCase().includes(needle));
      })
      .sort(
        (a, b) =>
          b.invoice.createdAt.getTime() - a.invoice.createdAt.getTime() ||
          b.invoice.id.localeCompare(a.invoice.id),
      );
    const offset = (filter.page - 1) * filter.limit;
    return { items: matching.slice(offset, offset + filter.limit), total: matching.length };
  }

  async countOverdue(today: string): Promise<number> {
    return [...this.invoices.values()].filter((invoice) => invoiceOverdue(invoice, today)).length;
  }
}
