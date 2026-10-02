import { vi } from "vitest";
import { InMemoryBillingSettingsRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-billing-settings.repository";
import { InMemoryM2mLicensePlanRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-m2m-license-plan.repository";
import { InMemoryOnboardingPaymentRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-onboarding-payment.repository";
import { InMemoryQuotationRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-quotation.repository";
import { InMemoryInvoiceRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-invoice.repository";
import {
  InMemoryLicencePeriodRepository,
  InMemoryRenewalFactsReader,
} from "@auth/onboarding/infrastructure/persistence/in-memory-licence-period.repository";
import { RenewalInvoiceService } from "@auth/onboarding/application/services/renewal-invoice.service";
import { SettleRenewalPaymentUseCase } from "@auth/onboarding/application/settle-renewal-payment.use-case";
import {
  PayRenewalByCardUseCase,
  PayRenewalFromWalletUseCase,
} from "@auth/onboarding/application/use-cases/billing/pay-renewal.use-cases";
import {
  GetTenantInvoiceUseCase,
  GetTenantLicenceUseCase,
  ListTenantInvoicesUseCase,
} from "@auth/onboarding/application/use-cases/billing/tenant-billing.use-cases";
import type { RenewalFacts } from "@auth/onboarding/domain/licence-period.repository";
import type { StoredM2mLicensePlan } from "@auth/onboarding/domain/m2m-license-plan.repository";
import type { StoredOnboardingPayment } from "@auth/onboarding/domain/onboarding-payment.repository";
import type { EnforcementEmail } from "@auth/onboarding/domain/ports/enforcement-notifier.port";
import { InMemoryEnforcementSettingsRepository } from "../../../apps/auth/src/in-memory-enforcement.repositories";
import {
  InMemoryArrearsRepository,
  InMemoryEnforcementNoticeRepository,
} from "../../../apps/auth/src/in-memory-enforcement-automation.repositories";
import { EnforcementAudit } from "../../../apps/auth/src/enforcement-audit";
import { EnforcementNoticeService } from "../../../apps/auth/src/enforcement-notice.service";
import { InMemoryTenantWalletRepository } from "../../../apps/auth/src/in-memory-tenant-wallet.repository";
import { PaymentEventService } from "../../../apps/auth/src/payment-event.service";
import { RenewalAudit } from "../../../apps/auth/src/renewal-audit";
import { InMemoryInvoiceNumberRepository } from "../../../apps/auth/src/in-memory-invoice-number.repository";
import { InvoiceNumberService } from "../../../apps/auth/src/invoice-number.service";
import { InvoiceSeriesInvoiceNumbers } from "../../../apps/auth/src/invoice-number.allocator";
import { RecordingAudit } from "./invoice-test-kit";

export const TENANT = "tenant-1";
export const APPLICATION = "app-1";

export const PLAN: StoredM2mLicensePlan = {
  id: "plan-1", code: "m2m_standard", name: "Standard", description: "d",
  perDeviceYear1Ngn: 10_000, perDeviceRenewalNgn: 6_000, validityDays: 365,
  components: ["GPS"], lastPriceChangedAt: null, sortOrder: 1, isActive: true,
  createdAt: new Date(0), updatedAt: new Date(0),
};

export function facts(over: Partial<RenewalFacts> = {}): RenewalFacts {
  return {
    applicationPlanCode: "m2m_standard", customerName: "Acme Logistics", customerType: "enterprise",
    billingEmail: "billing@acme.test", adminEmail: "admin@acme.test", fleetDeviceCount: 0,
    hasUser: true, terminated: false, ...over,
  };
}

export async function buildRenewals(start = "2026-10-01T09:00:00+01:00") {
  const clock = { now: new Date(start) };
  const payments = new InMemoryOnboardingPaymentRepository();
  const invoices = new InMemoryInvoiceRepository(payments, new InMemoryQuotationRepository(payments));
  const periods = new InMemoryLicencePeriodRepository(invoices, payments);
  const factsReader = new InMemoryRenewalFactsReader();
  const plans = new InMemoryM2mLicensePlanRepository();
  await plans.save({ ...PLAN });
  const billingSettings = new InMemoryBillingSettingsRepository();
  const settings = new InMemoryEnforcementSettingsRepository();
  const numbers = new InvoiceSeriesInvoiceNumbers(new InvoiceNumberService(new InMemoryInvoiceNumberRepository()));
  const wallet = new InMemoryTenantWalletRepository();

  const billingAudit = new RecordingAudit();
  const audit = new RenewalAudit(billingAudit);
  const notices = new InMemoryEnforcementNoticeRepository();
  notices.now = () => clock.now;
  notices.contacts.set(TENANT, { customerName: "Acme Logistics", emails: ["admin@acme.test"] });
  const mail: EnforcementEmail[] = [];
  const mailer = { fail: false };
  const noticeService = new EnforcementNoticeService(
    notices,
    new InMemoryArrearsRepository(),
    { send: vi.fn(async (email: EnforcementEmail) => { if (mailer.fail) throw new Error("smtp down"); mail.push(email); }) },
    new EnforcementAudit(billingAudit),
  );

  let ids = 0;
  const idGenerator = { generate: () => `id-${++ids}` };
  const service = new RenewalInvoiceService(
    periods, factsReader, plans, invoices, payments, billingSettings, settings, numbers, idGenerator, noticeService, audit,
  );

  const restore = { onPaymentSettled: vi.fn(async () => undefined) };
  const events = new PaymentEventService();
  const emitted = vi.spyOn(events, "emit");
  const settle = new SettleRenewalPaymentUseCase(payments, invoices, periods, wallet, audit, events, restore as never);
  const gateway = {
    name: "paystack", signatureHeader: "x", isConfigured: () => true,
    initiateCharge: vi.fn(async (request: { reference: string }) => ({
      reference: request.reference, authorizationUrl: `https://pay.test/${request.reference}`, provider: "paystack",
    })),
    verifyCallbackSignature: () => true, parseCallback: () => null,
  };
  const payWallet = new PayRenewalFromWalletUseCase(invoices, payments, wallet, settle, settings, idGenerator);
  const payCard = new PayRenewalByCardUseCase(invoices, payments, gateway as never, idGenerator);
  const tenantViews = {
    list: new ListTenantInvoicesUseCase(invoices, periods, settings),
    get: new GetTenantInvoiceUseCase(invoices, payments, periods, settings),
    licence: new GetTenantLicenceUseCase(periods, plans, invoices),
  };

  const at = (date: string, hour = 9) => {
    clock.now = new Date(`${date}T${String(hour).padStart(2, "0")}:00:00+01:00`);
    return clock.now;
  };
  const addPeriod = (over: Partial<Parameters<InMemoryLicencePeriodRepository["add"]>[0]> = {}) =>
    periods.add({
      tenantId: TENANT, applicationId: APPLICATION, planCode: "m2m_standard", deviceCount: 5,
      periodStart: "2025-10-09", periodEnd: "2026-10-08", origin: "purchase", ...over,
    });
  const sweep = () => service.run(clock.now);
  const openInvoices = () => invoices.listOpenRenewals();

  const gatewayPayment = async (
    reference: string,
    invoiceId: string,
    amountKobo: number,
    over: Partial<StoredOnboardingPayment> = {},
  ) => {
    const now = clock.now;
    const row: StoredOnboardingPayment = {
      id: `pay-${reference}`, applicationId: APPLICATION, reference, provider: "paystack", amountKobo,
      authorizationUrl: null, billingEmail: "billing@acme.test", planCode: "m2m_standard", deviceCount: 5,
      orderSummary: null, quotationId: null, invoiceId, method: null, customerName: null, note: null,
      autoReconciled: true, status: "pending", paidAt: null, createdAt: now, updatedAt: now, ...over,
    };
    await payments.save(row);
    return row;
  };
  const paidCallback = (amountKobo: number) => ({
    succeeded: true, paid: { amountKobo, currency: "NGN", channel: "card" },
  });

  factsReader.byTenant.set(TENANT, facts());

  return {
    clock, payments, invoices, periods, factsReader, plans, billingSettings, settings, wallet, billingAudit, audit,
    notices, mail, mailer, noticeService, service, settle, restore, events, emitted, gateway, payWallet, payCard,
    tenantViews, at, addPeriod, sweep, openInvoices, gatewayPayment, paidCallback,
  };
}

export type RenewalHarness = Awaited<ReturnType<typeof buildRenewals>>;
