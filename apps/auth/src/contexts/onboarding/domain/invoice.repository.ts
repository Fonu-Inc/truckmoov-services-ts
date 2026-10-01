import type { OnboardingApplicantType } from './onboarding-application.repository';
import type { StoredQuotationLine } from './quotation.repository';

export const INVOICE_STATUSES = [
  'draft',
  'issued',
  'partially_paid',
  'paid',
  'overdue',
  'cancelled',
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export type StoredInvoiceLine = Omit<StoredQuotationLine, 'quotationId'> & {
  invoiceId: string;
};

export type StoredInvoice = {
  id: string;
  number: string;
  prefix: string;
  year: number;
  sequence: number;
  quotationId: string | null;
  applicationId: string | null;
  tenantId: string | null;
  customerName: string;
  customerType: OnboardingApplicantType;
  billingEmail: string;
  status: InvoiceStatus;
  /** YYYY-MM-DD, Lagos calendar. */
  issueDate: string;
  dueDate: string;
  subtotalKobo: number;
  discountKobo: number;
  taxRateBp: number;
  taxKobo: number;
  totalKobo: number;
  amountPaidKobo: number;
  emailedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type InvoiceWithLines = StoredInvoice & { lines: StoredInvoiceLine[] };

export type InvoiceListFilter = {
  q?: string;
  status?: InvoiceStatus;
  page: number;
  limit: number;
  today: string;
};

export type InvoiceListRow = {
  invoice: StoredInvoice;
  quotationNumber: string | null;
};

export interface InvoiceRepository {
  findByQuotationId(quotationId: string): Promise<InvoiceWithLines | null>;
  /** Inserts unless the quotation already has an invoice; created is false then. */
  createIfAbsent(
    invoice: InvoiceWithLines,
  ): Promise<{ invoice: InvoiceWithLines; created: boolean }>;
  /** Re-derives amount paid and status from the successful payments; safe to repeat. */
  recomputePaid(invoiceId: string): Promise<void>;
  /** Sets emailed_at only while it is still empty; false when already set. */
  markEmailed(id: string, at: Date): Promise<boolean>;
  findById(id: string): Promise<InvoiceWithLines | null>;
  findQuotationNumber(invoiceId: string): Promise<string | null>;
  list(filter: InvoiceListFilter): Promise<{
    items: InvoiceListRow[];
    total: number;
  }>;
  countOverdue(today: string): Promise<number>;
}

export const INVOICE_REPOSITORY = Symbol('INVOICE_REPOSITORY');

export function invoiceOverdue(
  invoice: Pick<StoredInvoice, 'status' | 'dueDate' | 'totalKobo' | 'amountPaidKobo'>,
  today: string,
): boolean {
  return (
    (invoice.status === 'issued' || invoice.status === 'partially_paid') &&
    invoice.dueDate < today &&
    invoice.totalKobo - invoice.amountPaidKobo > 0
  );
}

export function effectiveInvoiceStatus(
  invoice: Pick<StoredInvoice, 'status' | 'dueDate' | 'totalKobo' | 'amountPaidKobo'>,
  today: string,
): InvoiceStatus {
  return invoiceOverdue(invoice, today) ? 'overdue' : invoice.status;
}

export function settledInvoiceStatus(
  totalKobo: number,
  paidKobo: number,
): InvoiceStatus {
  return paidKobo >= totalKobo ? 'paid' : 'partially_paid';
}
