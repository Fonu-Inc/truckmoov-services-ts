import type { PaymentHistoryRow } from '@auth/onboarding/domain/payment-history.repository';
import { toApiPaymentStatus } from '@auth/onboarding/domain/payment-status';
import { koboToNgn } from '@auth/onboarding/domain/quotation-totals';

export function toPaymentRowView({ payment, ...joined }: PaymentHistoryRow) {
  return {
    id: payment.id,
    reference: payment.reference,
    customerName: joined.customerName,
    quotationId: payment.quotationId,
    quotationNumber: joined.quotationNumber,
    invoiceId: payment.invoiceId,
    invoiceNumber: joined.invoiceNumber,
    productName: joined.productName,
    deviceCount: payment.deviceCount,
    amountNgn: koboToNgn(payment.amountKobo),
    method: payment.method,
    status: toApiPaymentStatus(payment.status),
    paidAt: payment.paidAt?.toISOString() ?? null,
    createdAt: payment.createdAt.toISOString(),
  };
}

function toBreakdownView(row: PaymentHistoryRow) {
  const order = row.payment.orderSummary;
  if (!order) return null;
  return {
    planCode: order.planCode,
    planName: order.planName,
    deviceCount: order.deviceCount,
    perDeviceNgn: order.perDeviceNgn,
    devicesNgn: order.devicesNgn,
    installationPerDeviceNgn: order.installationPerDeviceNgn,
    installationNgn: order.installationNgn,
    subtotalNgn: order.subtotalNgn,
    taxRateBp: order.taxRateBp,
    taxNgn: order.taxNgn,
    totalNgn: order.totalNgn,
  };
}

export function toPaymentDetailView(row: PaymentHistoryRow) {
  return {
    ...toPaymentRowView(row),
    provider: row.payment.provider,
    billingEmail: row.payment.billingEmail,
    note: row.payment.note,
    autoReconciled: row.payment.autoReconciled,
    breakdown: toBreakdownView(row),
  };
}
