import { addDaysToDate } from '@auth/onboarding/domain/invoice-dates';
import { daysBetween } from '@auth/onboarding/domain/enforcement-stage';
import {
  effectiveInvoiceStatus,
  outstandingKobo,
  planFactsOf,
  type InvoicePlanFacts,
  type InvoiceWithLines,
  type StoredInvoice,
  type StoredInvoiceLine,
} from '@auth/onboarding/domain/invoice.repository';
import { koboToNgn } from '@auth/onboarding/domain/quotation-totals';

const PAYABLE_STATUSES: readonly string[] = ['issued', 'partially_paid', 'overdue'];

export function isPayable(invoice: StoredInvoice, isRenewal: boolean): boolean {
  return isRenewal && PAYABLE_STATUSES.includes(invoice.status) && outstandingKobo(invoice) > 0;
}

type InvoiceViewContext = {
  isRenewal: boolean;
  periodEnd: string | null;
  graceDays: number;
  today: string;
  plan?: InvoicePlanFacts | null;
  quotationNumber?: string | null;
};

const monthYear = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayMonthYear = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const atMidnight = (date: string) => new Date(`${date}T00:00:00Z`);

/** A renewal bills the term that starts the day after the licence it renews ends. */
export function billingPeriodLabel(
  invoice: Pick<StoredInvoice, 'issueDate'>,
  context: Pick<InvoiceViewContext, 'isRenewal' | 'periodEnd' | 'plan'>,
): string {
  const issued = monthYear.format(atMidnight(invoice.issueDate));
  if (!context.isRenewal) return `Onboarding (${issued})`;
  const validityDays = context.plan?.validityDays;
  if (!context.periodEnd || !validityDays) return `Renewal (${issued})`;
  const start = addDaysToDate(context.periodEnd, 1);
  const end = addDaysToDate(start, validityDays - 1);
  return `${dayMonthYear.format(atMidnight(start))} to ${dayMonthYear.format(atMidnight(end))}`;
}

export function tenantInvoiceView(invoice: StoredInvoice, context: InvoiceViewContext) {
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
    planName: context.plan?.name ?? null,
    deviceCount: context.plan?.quantity ?? 0,
    billingPeriod: billingPeriodLabel(invoice, context),
    quotationNumber: context.quotationNumber ?? null,
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

export type TenantInvoicePaymentFacts = {
  reference: string;
  method: string | null;
  paidAt: Date | null;
  amountKobo: number;
};

export function tenantInvoiceDetailView(
  invoice: InvoiceWithLines,
  context: InvoiceViewContext,
  payments: TenantInvoicePaymentFacts[] = [],
) {
  return {
    ...tenantInvoiceView(invoice, { ...context, plan: planFactsOf(invoice.lines) }),
    subtotalNgn: koboToNgn(invoice.subtotalKobo),
    discountNgn: koboToNgn(invoice.discountKobo),
    taxNgn: koboToNgn(invoice.taxKobo),
    taxRateBp: invoice.taxRateBp,
    lines: invoice.lines.map(lineView),
    payments: payments.map((payment) => ({
      reference: payment.reference,
      method: payment.method,
      paidAt: payment.paidAt?.toISOString() ?? null,
      amountNgn: koboToNgn(payment.amountKobo),
    })),
  };
}
