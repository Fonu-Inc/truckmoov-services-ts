import { Inject, Injectable } from '@nestjs/common';
import { lagosDate } from '@auth/onboarding/domain/invoice-dates';
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
  isRenewalInvoice,
  outstandingKobo,
  settledInvoiceStatus,
  invoiceOverdue,
  matchesTenantState,
  planFactsOf,
  type InvoiceListFilter,
  type InvoiceListRow,
  type InvoiceRepository,
  type InvoiceWithLines,
  type RenewalAmounts,
  type TenantInvoiceFact,
  type TenantInvoiceFilter,
  type TenantInvoicePage,
} from '@auth/onboarding/domain/invoice.repository';

function copy(invoice: InvoiceWithLines): InvoiceWithLines {
  return { ...invoice, lines: invoice.lines.map((line) => ({ ...line })) };
}

@Injectable()
export class InMemoryInvoiceRepository implements InvoiceRepository {
  private readonly invoices = new Map<string, InvoiceWithLines>();
  private readonly renewalLinks = new Map<string, string>();

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
        return {
          invoice: header,
          quotationNumber: await this.findQuotationNumber(invoice.id),
          isRenewal: isRenewalInvoice(invoice),
        };
      }),
    );
    const needle = filter.q?.trim().toLowerCase();
    const matching = rows
      .filter(({ invoice, quotationNumber, isRenewal }) => {
        if (filter.kind && (filter.kind === 'renewal') !== isRenewal) return false;
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

  async countOverdueByTenant(today: string): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    for (const invoice of this.invoices.values()) {
      if (!invoice.tenantId || !invoiceOverdue(invoice, today)) continue;
      counts.set(invoice.tenantId, (counts.get(invoice.tenantId) ?? 0) + 1);
    }
    return counts;
  }

  async createRenewal(invoice: InvoiceWithLines, periodId: string) {
    if (this.renewalLinks.has(periodId)) return { invoice: null, created: false };
    this.invoices.set(invoice.id, copy(invoice));
    this.renewalLinks.set(periodId, invoice.id);
    return { invoice: copy(invoice), created: true };
  }

  linkedInvoiceId(periodId: string): string | null {
    return this.renewalLinks.get(periodId) ?? null;
  }

  unlink(periodId: string): void {
    this.renewalLinks.delete(periodId);
  }

  async listOpenRenewals(): Promise<InvoiceWithLines[]> {
    return [...this.invoices.values()]
      .filter(
        (invoice) =>
          invoice.status === 'issued' &&
          invoice.amountPaidKobo === 0 &&
          invoice.tenantId !== null &&
          invoice.quotationId === null &&
          isRenewalInvoice(invoice),
      )
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id))
      .map(copy);
  }

  async cancelRenewal(id: string): Promise<boolean> {
    const invoice = this.invoices.get(id);
    if (!invoice || invoice.status !== 'issued' || invoice.amountPaidKobo !== 0) return false;
    if (!isRenewalInvoice(invoice)) return false;
    invoice.status = 'cancelled';
    invoice.updatedAt = new Date();
    return true;
  }

  async updateRenewalAmounts(id: string, amounts: RenewalAmounts): Promise<boolean> {
    const invoice = this.invoices.get(id);
    if (!invoice || invoice.status !== 'issued' || invoice.amountPaidKobo !== 0) return false;
    const line = invoice.lines.find((candidate) => candidate.kind === 'plan' && candidate.isRenewal);
    if (!line) return false;
    line.quantity = amounts.quantity;
    line.unitPriceKobo = amounts.unitPriceKobo;
    Object.assign(invoice, {
      subtotalKobo: amounts.subtotalKobo,
      taxRateBp: amounts.taxRateBp,
      taxKobo: amounts.taxKobo,
      totalKobo: amounts.totalKobo,
      updatedAt: new Date(),
    });
    return true;
  }

  async listForTenant(filter: TenantInvoiceFilter): Promise<TenantInvoicePage> {
    const mine = this.tenantInvoices(filter.tenantId);
    const open = mine.filter(isOpen);
    const needle = filter.q?.trim().toLowerCase();
    const matching = (
      await Promise.all(
        mine
          .filter((invoice) => scopeMatches(filter.scope, invoice))
          .filter((invoice) => !filter.state || matchesTenantState(invoice, filter.state, filter.today ?? lagosDate(new Date())))
          .map(async (invoice) => ({
            invoice,
            quotationNumber: await this.findQuotationNumber(invoice.id),
          })),
      )
    )
      .filter(({ invoice, quotationNumber }) => !needle || searchable(invoice, quotationNumber).includes(needle))
      .sort((a, b) => b.invoice.dueDate.localeCompare(a.invoice.dueDate) || b.invoice.id.localeCompare(a.invoice.id));
    const offset = (filter.page - 1) * filter.limit;
    return {
      items: matching.slice(offset, offset + filter.limit).map(({ invoice, quotationNumber }) => ({
        invoice: headerOf(invoice),
        isRenewal: isRenewalInvoice(invoice),
        plan: planFactsOf(invoice.lines),
        quotationNumber,
      })),
      total: matching.length,
      openTotalKobo: open.reduce((sum, invoice) => sum + outstandingKobo(invoice), 0),
      nextDueDate: open.map((invoice) => invoice.dueDate).sort()[0] ?? null,
    };
  }

  async findForTenant(tenantId: string, id: string) {
    const found = this.tenantInvoices(tenantId).find((invoice) => invoice.id === id);
    return found ? { ...copy(found), isRenewal: isRenewalInvoice(found) } : null;
  }

  async findLatestPaidPlanInvoice(tenantId: string): Promise<InvoiceWithLines | null> {
    const found = this.tenantInvoices(tenantId)
      .filter((invoice) => invoice.status === 'paid' && planFactsOf(invoice.lines))
      .sort(
        (a, b) =>
          b.issueDate.localeCompare(a.issueDate) ||
          b.createdAt.getTime() - a.createdAt.getTime() ||
          b.id.localeCompare(a.id),
      )[0];
    return found ? copy(found) : null;
  }

  async listFactsForTenant(tenantId: string): Promise<TenantInvoiceFact[]> {
    return this.tenantInvoices(tenantId)
      .sort(
        (a, b) =>
          a.issueDate.localeCompare(b.issueDate) ||
          a.createdAt.getTime() - b.createdAt.getTime() ||
          a.id.localeCompare(b.id),
      )
      .map((invoice) => ({
        id: invoice.id,
        number: invoice.number,
        issueDate: invoice.issueDate,
        createdAt: invoice.createdAt,
        totalKobo: invoice.totalKobo,
        amountPaidKobo: invoice.amountPaidKobo,
        licensingKobo: kindTotal(invoice, 'plan'),
        installationKobo: kindTotal(invoice, 'installation'),
      }));
  }

  private tenantInvoices(tenantId: string): InvoiceWithLines[] {
    return [...this.invoices.values()].filter(
      (invoice) => invoice.tenantId === tenantId && invoice.status !== 'draft' && invoice.status !== 'cancelled',
    );
  }
}

function headerOf(invoice: InvoiceWithLines) {
  const { lines: _lines, ...header } = copy(invoice);
  return header;
}

function isOpen(invoice: InvoiceWithLines): boolean {
  return (
    (invoice.status === 'issued' || invoice.status === 'partially_paid' || invoice.status === 'overdue') &&
    outstandingKobo(invoice) > 0
  );
}

function scopeMatches(scope: TenantInvoiceFilter['scope'], invoice: InvoiceWithLines): boolean {
  if (scope === 'open') return isOpen(invoice);
  return scope === 'paid' ? invoice.status === 'paid' : true;
}

function kindTotal(invoice: InvoiceWithLines, kind: 'plan' | 'installation'): number {
  return invoice.lines
    .filter((line) => line.kind === kind)
    .reduce((sum, line) => sum + line.quantity * line.unitPriceKobo, 0);
}

function searchable(invoice: InvoiceWithLines, quotationNumber: string | null): string {
  const month = new Date(`${invoice.issueDate}T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const plan = planFactsOf(invoice.lines)?.name ?? '';
  return [invoice.number, quotationNumber ?? '', plan, month].join(' ').toLowerCase();
}
