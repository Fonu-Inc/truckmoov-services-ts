import type { StoredOnboardingPayment } from '@auth/onboarding/domain/onboarding-payment.repository';
import {
  effectiveQuotationStatus,
  type QuotationWithLines,
  type StoredQuotation,
  type StoredQuotationLine,
} from '@auth/onboarding/domain/quotation.repository';
import { toApiPaymentStatus } from '@auth/onboarding/domain/payment-status';
import { koboToNgn } from '@auth/onboarding/domain/quotation-totals';

export function toQuotationRowView(
  quotation: StoredQuotation,
  paidKobo: number,
  lineCount: number,
  now: Date,
) {
  return {
    id: quotation.id,
    number: quotation.number,
    customerName: quotation.customerName,
    customerType: quotation.customerType,
    billingEmail: quotation.billingEmail,
    status: effectiveQuotationStatus(quotation, now),
    createdAt: quotation.createdAt.toISOString(),
    validUntil: quotation.validUntil.toISOString(),
    subtotalNgn: koboToNgn(quotation.subtotalKobo),
    discountNgn: koboToNgn(quotation.discountKobo),
    taxRateBp: quotation.taxRateBp,
    taxNgn: koboToNgn(quotation.taxKobo),
    totalNgn: koboToNgn(quotation.totalKobo),
    paidNgn: koboToNgn(paidKobo),
    outstandingNgn: koboToNgn(Math.max(quotation.totalKobo - paidKobo, 0)),
    paymentComplete: paidKobo >= quotation.totalKobo,
    lineCount,
  };
}

export function toQuotationLineView(line: StoredQuotationLine) {
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

export function toQuotationPaymentView(payment: StoredOnboardingPayment) {
  return {
    reference: payment.reference,
    amountNgn: koboToNgn(payment.amountKobo),
    status: toApiPaymentStatus(payment.status),
    paidAt: payment.paidAt?.toISOString() ?? null,
  };
}

export function toQuotationDetailView(
  quotation: QuotationWithLines,
  payments: StoredOnboardingPayment[],
  now: Date,
) {
  const paidKobo = payments
    .filter((payment) => payment.status === 'paid')
    .reduce((sum, payment) => sum + payment.amountKobo, 0);
  return {
    ...toQuotationRowView(quotation, paidKobo, quotation.lines.length, now),
    lines: quotation.lines.map(toQuotationLineView),
    payments: payments.map(toQuotationPaymentView),
  };
}
