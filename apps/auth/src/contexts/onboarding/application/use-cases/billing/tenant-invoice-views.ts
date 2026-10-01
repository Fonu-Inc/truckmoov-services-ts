import { addDaysToDate } from '@auth/onboarding/domain/invoice-dates';
import { daysBetween } from '@auth/onboarding/domain/enforcement-stage';
import {
  effectiveInvoiceStatus,
  outstandingKobo,
  type InvoiceWithLines,
  type StoredInvoice,
  type StoredInvoiceLine,
} from '@auth/onboarding/domain/invoice.repository';
import { koboToNgn } from '@auth/onboarding/domain/quotation-totals';

const PAYABLE_STATUSES: readonly string[] = ['issued', 'partially_paid', 'overdue'];

export function isPayable(invoice: StoredInvoice, isRenewal: boolean): boolean {
  return isRenewal && PAYABLE_STATUSES.includes(invoice.status) && outstandingKobo(invoice) > 0;
}

export function tenantInvoiceView(
  invoice: StoredInvoice,
  context: { isRenewal: boolean; periodEnd: string | null; graceDays: number; today: string },
) {
  const outstanding = outstandingKobo(invoice);
  const unpaid = PAYABLE_STATUSES.includes(invoice.status) && outstanding > 0;
  return {
    id: invoice.id,
    number: invoice.number,
    kind: context.isRenewal ? ('renewal' as const) : ('first' as const),
    status: effectiveInvoiceStatus(invoice, context.today),
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    totalNgn: koboToNgn(invoice.totalKobo),
    amountPaidNgn: koboToNgn(invoice.amountPaidKobo),
    outstandingNgn: koboToNgn(outstanding),
    daysOverdue: unpaid ? Math.max(0, daysBetween(invoice.dueDate, context.today)) : 0,
    graceEndsOn: unpaid ? addDaysToDate(invoice.dueDate, context.graceDays) : null,
    payable: isPayable(invoice, context.isRenewal),
    periodEnd: context.periodEnd,
  };
}

function lineView(line: StoredInvoiceLine) {
  return {
    kind: line.kind,
    name: line.name,
    description: line.description,
    quantity: line.quantity,
    unitPriceNgn: koboToNgn(line.unitPriceKobo),
    lineTotalNgn: koboToNgn(line.quantity * line.unitPriceKobo),
    validityDays: line.validityDays,
    components: line.components ?? [],
  };
}

export function tenantInvoiceDetailView(
  invoice: InvoiceWithLines,
  context: Parameters<typeof tenantInvoiceView>[1],
) {
  return {
    ...tenantInvoiceView(invoice, context),
    subtotalNgn: koboToNgn(invoice.subtotalKobo),
    taxNgn: koboToNgn(invoice.taxKobo),
    taxRateBp: invoice.taxRateBp,
    lines: invoice.lines.map(lineView),
  };
}
