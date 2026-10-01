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

export interface PaymentHistoryRepository {
  list(filter: PaymentHistoryFilter): Promise<{
    items: PaymentHistoryRow[];
    total: number;
  }>;
  findById(id: string): Promise<PaymentHistoryRow | null>;
}

export const PAYMENT_HISTORY_REPOSITORY = Symbol('PAYMENT_HISTORY_REPOSITORY');
