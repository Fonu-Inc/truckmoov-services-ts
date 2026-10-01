import { InMemoryQuotationRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-quotation.repository";
import { OrderQuotationService } from "@auth/onboarding/application/services/order-quotation.service";
import type { M2mLicensePlanRepository } from "@auth/onboarding/domain/m2m-license-plan.repository";
import type { BillingSettingsRepository } from "@auth/onboarding/domain/billing-settings.repository";
import type { OnboardingPaymentRepository } from "@auth/onboarding/domain/onboarding-payment.repository";
import { InMemoryInvoiceNumberRepository } from "../../../apps/auth/src/in-memory-invoice-number.repository";
import { InvoiceNumberService } from "../../../apps/auth/src/invoice-number.service";
import { InvoiceSeriesQuotationNumbers } from "../../../apps/auth/src/quotation-number.allocator";

export function buildQuotationKit(
  plans: M2mLicensePlanRepository,
  settings: BillingSettingsRepository,
  payments: OnboardingPaymentRepository,
) {
  let ids = 0;
  const repository = new InMemoryQuotationRepository(payments);
  const service = new OrderQuotationService(
    repository,
    new InvoiceSeriesQuotationNumbers(new InvoiceNumberService(new InMemoryInvoiceNumberRepository())),
    plans,
    settings,
    { generate: () => `qt-id-${++ids}` },
  );
  return { repository, service };
}
