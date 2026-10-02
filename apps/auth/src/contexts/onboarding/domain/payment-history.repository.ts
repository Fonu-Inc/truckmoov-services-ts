import type {
  OnboardingPaymentStatus,
  StoredOnboardingPayment,
} from './onboarding-payment.repository';
import type { PaymentMethod } from './payment-method';

export type PaymentHistoryFilter = {
  q?: string;
  statuses?: OnboardingPaymentStatus[];
  method?: PaymentMethod;
  page: number;
  limit: number;
};

export type PaymentHistoryRow = {
  payment: StoredOnboardingPayment;
  customerName: string;
  quotationNumber: string | null;
  invoiceNumber: string | null;
  productName: string;
};

export type TenantPaymentFilter = Omit<PaymentHistoryFilter, 'statuses'> & {
  tenantId: string;
  statuses?: OnboardingPaymentStatus[];
  /** YYYY-MM-DD, Lagos calendar, inclusive. */
  from?: string;
  to?: string;
};

export type TenantPaymentRow = PaymentHistoryRow & {
  isRenewal: boolean;
};

export type TenantPaidAmount = { id: string; reference: string; paidAt: Date; amountKobo: number };

export interface PaymentHistoryRepository {
  list(filter: PaymentHistoryFilter): Promise<{
    items: PaymentHistoryRow[];
    total: number;
  }>;
  findById(id: string): Promise<PaymentHistoryRow | null>;
  /** Payments owed to the tenant through its invoices, quotations or application only. */
  listForTenant(filter: TenantPaymentFilter): Promise<{ items: TenantPaymentRow[]; total: number }>;
  findForTenant(tenantId: string, id: string): Promise<TenantPaymentRow | null>;
  /** Successful payments of the tenant, oldest first. */
  listPaidForTenant(tenantId: string): Promise<TenantPaidAmount[]>;
}

export const PAYMENT_HISTORY_REPOSITORY = Symbol('PAYMENT_HISTORY_REPOSITORY');
