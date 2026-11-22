import type { OnboardingApplicantType } from './onboarding-application.repository';

export const QUOTATION_STATUSES = [
  'draft',
  'pending_review',
  'sent',
  'accepted',
  'expired',
  'cancelled',
] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

export type QuotationLineKind = 'plan' | 'installation' | 'telecom_master_sim';

export type StoredQuotationLine = {
  id: string;
  quotationId: string;
  position: number;
  kind: QuotationLineKind;
  planCode: string | null;
  name: string;
  description: string | null;
  quantity: number;
  unitPriceKobo: number;
  validityDays: number | null;
  components: string[] | null;
  isRenewal: boolean;
};

export type StoredQuotation = {
  id: string;
  number: string;
  prefix: string;
  year: number;
  sequence: number;
  applicationId: string | null;
  tenantId: string | null;
  planCode: string;
  deviceCount: number;
  customerName: string;
  customerType: OnboardingApplicantType;
  billingEmail: string;
  status: QuotationStatus;
  subtotalKobo: number;
  discountKobo: number;
  taxRateBp: number;
  taxKobo: number;
  totalKobo: number;
  validUntil: Date;
  sentAt: Date | null;
  acceptedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type QuotationWithLines = StoredQuotation & {
  lines: StoredQuotationLine[];
};

export type QuotationKey = {
  applicationId: string;
  planCode: string;
  deviceCount: number;
  totalKobo: number;
};

export type QuotationPaymentStatusFilter = 'complete' | 'incomplete';

export type QuotationListFilter = {
  q?: string;
  status?: QuotationStatus;
  paymentStatus?: QuotationPaymentStatusFilter;
  page: number;
  limit: number;
  now: Date;
};

export type QuotationListRow = {
  quotation: StoredQuotation;
  paidKobo: number;
  lineCount: number;
  /** Name of the first plan line, null when the quotation has none. */
  productName: string | null;
};

export const TENANT_QUOTATION_STATUSES = [
  'draft',
  'sent',
  'awaiting_decision',
  'accepted',
  'paid',
  'expired',
  'cancelled',
] as const;
export type TenantQuotationStatus = (typeof TENANT_QUOTATION_STATUSES)[number];

export type TenantQuotationFilter = {
  tenantId: string;
  q?: string;
  status?: TenantQuotationStatus;
  page: number;
  limit: number;
  now: Date;
};

export type TenantQuotationRow = {
  quotation: StoredQuotation;
  lines: StoredQuotationLine[];
  paidKobo: number;
  applicationReference: string | null;
  paymentReference: string | null;
};

export interface QuotationRepository {
  findActiveByKey(key: QuotationKey): Promise<QuotationWithLines | null>;
  /** Inserts unless a non-cancelled quotation already holds the key; created is false then. */
  createIfAbsent(
    quotation: QuotationWithLines,
  ): Promise<{ quotation: QuotationWithLines; created: boolean }>;
  /** Compare-and-set: only a sent quotation whose validity has passed is extended. */
  extendValidity(id: string, validUntil: Date, now: Date): Promise<boolean>;
  /** Compare-and-set: true only for the call that moved an open quotation to accepted. */
  markAccepted(id: string, at: Date): Promise<boolean>;
  findById(id: string): Promise<QuotationWithLines | null>;
  list(filter: QuotationListFilter): Promise<{
    items: QuotationListRow[];
    total: number;
  }>;
  /** Quotations of the tenant that were sent to it; drafts and reviews stay internal. */
  listForTenant(filter: TenantQuotationFilter): Promise<{ items: TenantQuotationRow[]; total: number }>;
  findForTenant(tenantId: string, id: string, now: Date): Promise<TenantQuotationRow | null>;
}

export const QUOTATION_REPOSITORY = Symbol('QUOTATION_REPOSITORY');

export function quotationExpired(
  quotation: Pick<StoredQuotation, 'status' | 'validUntil'>,
  now: Date,
): boolean {
  if (quotation.status === 'accepted' || quotation.status === 'cancelled') {
    return false;
  }
  return (
    quotation.status === 'expired' ||
    quotation.validUntil.getTime() < now.getTime()
  );
}

export function effectiveQuotationStatus(
  quotation: Pick<StoredQuotation, 'status' | 'validUntil'>,
  now: Date,
): QuotationStatus {
  return quotationExpired(quotation, now) ? 'expired' : quotation.status;
}

/** What the tenant sees. Draft and sent are never produced: those quotations are not shown to it. */
export function tenantQuotationStatus(
  quotation: Pick<StoredQuotation, 'status' | 'validUntil' | 'totalKobo'>,
  paidKobo: number,
  now: Date,
): TenantQuotationStatus {
  const effective = effectiveQuotationStatus(quotation, now);
  if (effective === 'accepted') return paidKobo >= quotation.totalKobo ? 'paid' : 'accepted';
  if (effective === 'sent') return 'awaiting_decision';
  if (effective === 'expired' || effective === 'cancelled') return effective;
  return 'awaiting_decision';
}

export const HIDDEN_FROM_TENANT_QUOTATION_STATUSES: readonly QuotationStatus[] = ['draft', 'pending_review'];
