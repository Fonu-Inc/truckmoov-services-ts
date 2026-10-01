import {
  effectiveInvoiceStatus,
  type InvoiceWithLines,
  type StoredInvoice,
  type StoredInvoiceLine,
} from '@auth/onboarding/domain/invoice.repository';
import type { StoredOnboardingPayment } from '@auth/onboarding/domain/onboarding-payment.repository';
import { toApiPaymentStatus } from '@auth/onboarding/domain/payment-status';
import { koboToNgn } from '@auth/onboarding/domain/quotation-totals';

export type InvoiceRenewalInfo = { isRenewal: boolean; periodEnd: string | null };

const FIRST_PURCHASE: InvoiceRenewalInfo = { isRenewal: false, periodEnd: null };

export function toInvoiceRowView(
  invoice: StoredInvoice,
  quotationNumber: string | null,
  today: string,
  renewal: InvoiceRenewalInfo = FIRST_PURCHASE,
) {
  return {
    id: invoice.id,
    number: invoice.number,
    quotationId: invoice.quotationId,
    quotationNumber,
    tenantId: invoice.tenantId,
    isRenewal: renewal.isRenewal,
    periodEnd: renewal.periodEnd,
    customerName: invoice.customerName,
    customerType: invoice.customerType,
    status: effectiveInvoiceStatus(invoice, today),
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    subtotalNgn: koboToNgn(invoice.subtotalKobo),
    discountNgn: koboToNgn(invoice.discountKobo),
    taxNgn: koboToNgn(invoice.taxKobo),
    totalNgn: koboToNgn(invoice.totalKobo),
    amountPaidNgn: koboToNgn(invoice.amountPaidKobo),
    outstandingNgn: koboToNgn(Math.max(invoice.totalKobo - invoice.amountPaidKobo, 0)),
    emailedAt: invoice.emailedAt?.toISOString() ?? null,
  };
}

function toInvoiceLineView(line: StoredInvoiceLine) {
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

function toAppliedPaymentView(payment: StoredOnboardingPayment) {
  return {
    reference: payment.reference,
    method: payment.method,
    amountNgn: koboToNgn(payment.amountKobo),
    paidAt: payment.paidAt?.toISOString() ?? null,
    status: toApiPaymentStatus(payment.status),
  };
}

export function toInvoiceDetailView(
  invoice: InvoiceWithLines,
  quotationNumber: string | null,
  payments: StoredOnboardingPayment[],
  today: string,
  renewal: InvoiceRenewalInfo = FIRST_PURCHASE,
) {
  return {
    ...toInvoiceRowView(invoice, quotationNumber, today, renewal),
    billingEmail: invoice.billingEmail,
    taxRateBp: invoice.taxRateBp,
    lines: invoice.lines.map(toInvoiceLineView),
    payments: payments.map(toAppliedPaymentView),
  };
}
