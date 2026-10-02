import { lagosDate } from '@auth/onboarding/domain/invoice-dates';
import type { TenantPaymentRow } from '@auth/onboarding/domain/payment-history.repository';
import { toTenantPaymentStatus } from '@auth/onboarding/domain/payment-status';
import {
  tenantQuotationStatus,
  type StoredQuotationLine,
  type TenantQuotationRow,
  type TenantQuotationStatus,
} from '@auth/onboarding/domain/quotation.repository';
import { koboToNgn } from '@auth/onboarding/domain/quotation-totals';
import { toQuotationLineView } from './quotation-views';

const devices = (count: number) => `${count} ${count === 1 ? 'device' : 'devices'}`;

function planLine(lines: StoredQuotationLine[]) {
  return lines.find((line) => line.kind === 'plan');
}

function operationalOutcome(status: TenantQuotationStatus, deviceCount: number): string {
  if (status === 'paid') return `Fleet activated — ${devices(deviceCount)}`;
  if (status === 'accepted') return 'Accepted — awaiting payment';
  if (status === 'expired') return 'Not activated — quotation expired';
  if (status === 'cancelled') return 'Not activated — quotation cancelled';
  return 'Pending your acceptance';
}

export function tenantQuotationRowView(row: TenantQuotationRow, now: Date) {
  const { quotation, lines } = row;
  const plan = planLine(lines);
  const deviceCount = plan?.quantity ?? quotation.deviceCount;
  const planName = plan?.name ?? quotation.planCode;
  const status = tenantQuotationStatus(quotation, row.paidKobo, now);
  return {
    id: quotation.id,
    number: quotation.number,
    date: lagosDate(quotation.sentAt ?? quotation.createdAt),
    planName,
    deviceCount,
    description: lines.map((line) => line.name).join(', '),
    purpose: `${planName} — ${devices(deviceCount)}`,
    category: 'Onboarding' as const,
    status,
    relatedRequest: row.applicationReference ? `Application ${row.applicationReference}` : null,
    totalNgn: koboToNgn(quotation.totalKobo),
    paymentRef: row.paymentReference,
    operationalOutcome: operationalOutcome(status, deviceCount),
  };
}

export function tenantQuotationDetailView(row: TenantQuotationRow, invoiceNumber: string | null, now: Date) {
  const { quotation } = row;
  return {
    ...tenantQuotationRowView(row, now),
    invoiceNumber,
    validUntil: quotation.validUntil.toISOString(),
    subtotalNgn: koboToNgn(quotation.subtotalKobo),
    discountNgn: koboToNgn(quotation.discountKobo),
    taxNgn: koboToNgn(quotation.taxKobo),
    taxRateBp: quotation.taxRateBp,
    lines: row.lines.map(toQuotationLineView),
  };
}

export function tenantPaymentRowView(row: TenantPaymentRow) {
  const { payment } = row;
  const kind = row.isRenewal ? 'renewal' : 'year one';
  return {
    id: payment.id,
    reference: payment.reference,
    date: (payment.paidAt ?? payment.createdAt).toISOString(),
    planName: row.productName,
    deviceCount: payment.deviceCount,
    amountNgn: koboToNgn(payment.amountKobo),
    method: payment.method,
    status: toTenantPaymentStatus(payment.status),
    invoiceNumber: row.invoiceNumber,
    quotationNumber: row.quotationNumber,
    paidFor: `${row.productName} — ${devices(payment.deviceCount)} (${kind})`,
  };
}
