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

export type QuotationLineKind = 'plan' | 'installation';

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
