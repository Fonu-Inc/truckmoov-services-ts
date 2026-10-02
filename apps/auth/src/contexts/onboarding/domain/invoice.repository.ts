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

export type InvoiceKind = 'renewal' | 'first';

export type InvoiceListFilter = {
  q?: string;
  status?: InvoiceStatus;
  kind?: InvoiceKind;
  page: number;
  limit: number;
  today: string;
};

export type InvoiceListRow = {
  invoice: StoredInvoice;
  quotationNumber: string | null;
  isRenewal: boolean;
};

export const TENANT_INVOICE_STATES = ['pending', 'partially_paid', 'overdue'] as const;
export type TenantInvoiceState = (typeof TENANT_INVOICE_STATES)[number];

export type TenantInvoiceFilter = {
  tenantId: string;
  scope: 'open' | 'paid' | 'all';
  /** Exact state as the tenant sees it; pending is issued with nothing paid. */
  state?: TenantInvoiceState;
  q?: string;
  /** Lagos date used to judge overdue; defaults to today. */
  today?: string;
  page: number;
  limit: number;
};

export type InvoicePlanFacts = { name: string; quantity: number; validityDays: number | null };

export type TenantInvoiceRow = {
  invoice: StoredInvoice;
  isRenewal: boolean;
  plan: InvoicePlanFacts | null;
  quotationNumber: string | null;
};

export type TenantInvoiceFact = {
  id: string;
  number: string;
  issueDate: string;
  createdAt: Date;
  totalKobo: number;
  amountPaidKobo: number;
  licensingKobo: number;
  installationKobo: number;
};

export type TenantInvoicePage = {
  items: TenantInvoiceRow[];
  total: number;
  openTotalKobo: number;
  nextDueDate: string | null;
};

export type RenewalAmounts = {
  quantity: number;
  unitPriceKobo: number;
  subtotalKobo: number;
  taxRateBp: number;
  taxKobo: number;
  totalKobo: number;
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
  /**
   * Inserts a renewal invoice and links it to the period in one transaction.
   * created is false, and nothing is written, when the period already has one.
   */
  createRenewal(
    invoice: InvoiceWithLines,
    periodId: string,
  ): Promise<{ invoice: InvoiceWithLines | null; created: boolean }>;
  /** Renewal invoices still issued with nothing paid. */
  listOpenRenewals(): Promise<InvoiceWithLines[]>;
  /** Cancels only while issued with nothing paid; false otherwise. */
  cancelRenewal(id: string): Promise<boolean>;
  /** Rewrites the plan line and totals only while issued with nothing paid. */
  updateRenewalAmounts(id: string, amounts: RenewalAmounts): Promise<boolean>;
  /** Invoices owed by the tenant, whoever issued them, drafts and cancelled excluded. */
  listForTenant(filter: TenantInvoiceFilter): Promise<TenantInvoicePage>;
  findForTenant(tenantId: string, id: string): Promise<(InvoiceWithLines & { isRenewal: boolean }) | null>;
  /** Latest fully paid invoice with a plan line, the one that opened the current licence term. */
  findLatestPaidPlanInvoice(tenantId: string): Promise<InvoiceWithLines | null>;
  /** Every visible invoice of the tenant, oldest first, for totals and charts. */
  listFactsForTenant(tenantId: string): Promise<TenantInvoiceFact[]>;
}

export function planFactsOf(lines: StoredInvoiceLine[]): InvoicePlanFacts | null {
  const line = lines.find((candidate) => candidate.kind === 'plan');
  return line ? { name: line.name, quantity: line.quantity, validityDays: line.validityDays } : null;
}

export function matchesTenantState(
  invoice: Pick<StoredInvoice, 'status' | 'dueDate' | 'totalKobo' | 'amountPaidKobo'>,
  state: TenantInvoiceState,
  today: string,
): boolean {
  const effective = effectiveInvoiceStatus(invoice, today);
  return state === 'pending' ? effective === 'issued' : effective === state;
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

export function isRenewalInvoice(invoice: Pick<InvoiceWithLines, 'lines'>): boolean {
  return invoice.lines.some((line) => line.kind === 'plan' && line.isRenewal);
}

export function outstandingKobo(invoice: Pick<StoredInvoice, 'totalKobo' | 'amountPaidKobo'>): number {
  return Math.max(invoice.totalKobo - invoice.amountPaidKobo, 0);
}
