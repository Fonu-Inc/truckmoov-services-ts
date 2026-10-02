import type { OnboardingApplicantType } from './onboarding-application.repository';

export const LICENCE_PERIOD_STATUSES = ['active', 'renewed', 'ended'] as const;
export type LicencePeriodStatus = (typeof LICENCE_PERIOD_STATUSES)[number];

export type LicencePeriodOrigin = 'purchase' | 'backfill' | 'renewal';

export type StoredLicencePeriod = {
  id: string;
  tenantId: string;
  applicationId: string;
  planCode: string;
  deviceCount: number;
  /** YYYY-MM-DD, Lagos calendar. */
  periodStart: string;
  /** Last valid day, inclusive. */
  periodEnd: string;
  status: LicencePeriodStatus;
  renewalInvoiceId: string | null;
  origin: LicencePeriodOrigin;
  createdAt: Date;
  updatedAt: Date;
};

export type NewLicencePeriod = Omit<
  StoredLicencePeriod,
  'id' | 'status' | 'renewalInvoiceId' | 'createdAt' | 'updatedAt'
>;

export type PurchaseSeed = {
  tenantId: string;
  applicationId: string;
  planCode: string;
  quantity: number;
  validityDays: number;
  paidAt: Date;
};

export type RenewalFacts = {
  applicationPlanCode: string | null;
  customerName: string;
  customerType: OnboardingApplicantType;
  billingEmail: string | null;
  adminEmail: string | null;
  fleetDeviceCount: number;
  hasUser: boolean;
  terminated: boolean;
};

export type RenewalSettlementInput = {
  invoiceId: string;
  paymentId: string;
  today: string;
};

export type RenewalSettlement =
  | { outcome: 'renewed'; newPeriodEnd: string }
  | { outcome: 'no_change'; newPeriodEnd: string | null }
  | { outcome: 'partial' }
  | { outcome: 'duplicate'; amountKobo: number; reason: 'duplicate' | 'invoice_closed' }
  | { outcome: 'not_applicable' };

export interface LicencePeriodRepository {
  /** Latest paid first-time plan invoice per tenant that has no period yet. */
  purchaseSeeds(): Promise<PurchaseSeed[]>;
  /** False when the tenant already holds a period with that end date or an active one. */
  insertSeeded(period: NewLicencePeriod): Promise<boolean>;
  /** Active periods without a renewal invoice whose end is on or before the cutoff. */
  listDue(cutoff: string): Promise<StoredLicencePeriod[]>;
  findActiveByTenant(tenantId: string): Promise<StoredLicencePeriod | null>;
  /** Every period of the tenant, newest first. */
  listByTenant(tenantId: string): Promise<StoredLicencePeriod[]>;
  /** Plan code per tenant from its active period, else its latest one. */
  currentPlanCodes(): Promise<Map<string, string>>;
  findByRenewalInvoiceId(invoiceId: string): Promise<StoredLicencePeriod | null>;
  periodEndsForInvoices(invoiceIds: string[]): Promise<Map<string, string>>;
  /** Detaches the renewal invoice and syncs the plan so the next sweep reissues. */
  release(periodId: string, planCode: string): Promise<void>;
  end(periodId: string): Promise<void>;
  /**
   * One transaction: sums the paid payments onto the invoice and, when that
   * pays it, closes the period and opens the next. A payment that arrives
   * after the invoice was already covered is marked refunded and reported.
   */
  settleRenewalPayment(input: RenewalSettlementInput): Promise<RenewalSettlement>;
}

export const LICENCE_PERIOD_REPOSITORY = Symbol('LICENCE_PERIOD_REPOSITORY');

export interface RenewalFactsReader {
  facts(tenantId: string, applicationId: string): Promise<RenewalFacts | null>;
}

export const RENEWAL_FACTS_READER = Symbol('RENEWAL_FACTS_READER');

export const DUPLICATE_PAYMENT_NOTE = 'Credited to wallet: invoice was already covered';
