import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryOnboardingApplicationRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-onboarding-application.repository";
import { InMemoryOnboardingPaymentRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-onboarding-payment.repository";
import { InMemoryBillingSettingsRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-billing-settings.repository";
import { InMemoryM2mLicensePlanRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-m2m-license-plan.repository";
import { buildQuotationKit } from "./quotation-test-kit";
import { buildInvoiceKit } from "./invoice-test-kit";
import { GetOnboardingApplicationUseCase } from "@auth/onboarding/application/use-cases/get-onboarding-application.use-case";
import {
  ChargeRefusedError,
  ConfirmApplicationPaymentUseCase,
  CreateApplicationPaymentUseCase,
} from "@auth/onboarding/application/use-cases/pay-for-application.use-cases";
import { PaymentGatewayError, type PaymentGateway } from "../../../apps/auth/src/contexts/payments";
import { hashApplicationToken } from "@auth/onboarding/domain/onboarding-application.support";
import type { StoredOnboardingApplication } from "@auth/onboarding/domain/onboarding-application.repository";

const TOKEN = "applicant-token";
const TOTAL_KOBO = 2 * (25_000 + 15_000) * 100;

function application(): StoredOnboardingApplication {
  const now = new Date();
  return {
    id: "app-1",
    reference: "APP-2026-AAAA",
    tokenHash: hashApplicationToken(TOKEN),
    applicantType: "fleet_provider",
    organizationName: "Arne logistics Ltd",
    businessEmail: "jane@arne.com",
    organizationPhone: "+2348000000000",
    contactFullName: "Jane Doe",
    contactRole: null,
    streetAddress: "Mazi Fedelis Street",
    city: "Abuja",
    state: "FCT",
    rcNumber: null,
    taxIdentificationNumber: null,
    identificationType: null,
    identificationNumber: null,
    m2mPlanCode: "m2m_standard",
    billingEmail: "accounts@arne.com",
    billingEmailVerifiedAt: now,
    emailVerifiedAt: now,
    phoneVerifiedAt: now,
    status: "approved",
    stage: "payment",
    submittedAt: now,
    reviewedBy: null,
    reviewedAt: null,
    decisionReason: null,
    tenantId: null,
    setupLinkStatus: null,
    setupLinkSentAt: null,
    setupLinkError: null,
    setupLinkAttempts: 0,
    createdAt: now,
    updatedAt: now,
  };
}

describe("Onboarding payment settlement", () => {
  let applications: InMemoryOnboardingApplicationRepository;
  let payments: InMemoryOnboardingPaymentRepository;
  let charges: Array<{ reference: string }>;
  let failCharge: boolean;
  let pay: CreateApplicationPaymentUseCase;
  let confirm: ConfirmApplicationPaymentUseCase;
  const input = { applicationId: "app-1", applicationToken: TOKEN };

  beforeEach(async () => {
    applications = new InMemoryOnboardingApplicationRepository();
    payments = new InMemoryOnboardingPaymentRepository();
    const plans = new InMemoryM2mLicensePlanRepository();
    charges = [];
    failCharge = false;
    await applications.save(application());
    await plans.save({
      id: "plan-1",
      code: "m2m_standard",
      name: "Standard",
      description: "Standard M2M licence",
      perDeviceYear1Ngn: 25_000,
      perDeviceRenewalNgn: 20_000,
      validityDays: 365,
      components: null,
      lastPriceChangedAt: null,
      sortOrder: 1,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await applications.saveDeviceRequest({
      id: "req-1",
      applicationId: "app-1",
      quantity: 2,
      useCase: "Tracking the distribution fleet",
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const gateway = {
      name: "paystack",
      isConfigured: () => true,
      initiateCharge: async (request: { reference: string }) => {
        if (failCharge) throw new PaymentGatewayError("paystack", "down");
        charges.push(request);
        expect(await payments.findByReference(request.reference)).not.toBeNull();
        return {
          reference: request.reference,
          authorizationUrl: `https://pay.test/${request.reference}`,
          provider: "paystack",
        };
      },
    } as unknown as PaymentGateway;
    let ids = 0;
    const settings = new InMemoryBillingSettingsRepository();
    const quotationKit = buildQuotationKit(plans, settings, payments);
    pay = new CreateApplicationPaymentUseCase(
      applications,
      plans,
      payments,
      gateway,
      new GetOnboardingApplicationUseCase(applications),
      { generate: () => `pay-${++ids}` },
      settings,
      quotationKit.service,
    );
    confirm = new ConfirmApplicationPaymentUseCase(
      applications,
      payments,
      buildInvoiceKit({ quotations: quotationKit.repository, payments, settings }).service,
    );
  });

  async function startPayment() {
    return (await pay.execute(input)).data;
  }

  it("records the pending row before the gateway call and stores the url after", async () => {
    const started = await startPayment();

    const stored = await payments.findByReference(started.reference);
    expect(stored).toMatchObject({
      status: "pending",
      amountKobo: TOTAL_KOBO,
      authorizationUrl: started.authorizationUrl,
    });
  });

  it("reuses a recent pending payment instead of a new transaction", async () => {
    const first = await startPayment();
    const second = await startPayment();

    expect(second.reference).toBe(first.reference);
    expect(second.authorizationUrl).toBe(first.authorizationUrl);
    expect(charges).toHaveLength(1);
  });

  it("starts a new transaction once the pending payment is older than 30 minutes", async () => {
    const first = await startPayment();
    const stored = (await payments.findByReference(first.reference))!;
    await payments.save({ ...stored, createdAt: new Date(Date.now() - 31 * 60 * 1000) });

    const second = await startPayment();

    expect(second.reference).not.toBe(first.reference);
    expect(charges).toHaveLength(2);
  });

  it("gives every transaction a unique reference", async () => {
    const first = await startPayment();
    const stored = (await payments.findByReference(first.reference))!;
    await payments.save({ ...stored, status: "failed" });

    const second = await startPayment();

    expect(second.reference).not.toBe(first.reference);
  });

  it("drops the pending row when the gateway refuses", async () => {
    failCharge = true;

    await expect(pay.execute(input)).rejects.toBeInstanceOf(ChargeRefusedError);
    expect(await payments.findLatestForApplication("app-1")).toBeNull();
  });

  it("settles once and treats a second delivery as a no-op", async () => {
    const { reference } = await startPayment();
    const paid = { amountKobo: TOTAL_KOBO, currency: "NGN" };

    await confirm.execute(reference, true, paid);
    expect((await applications.findById("app-1"))!.stage).toBe("installation_scheduling");
    await expect(confirm.execute(reference, true, paid)).resolves.toBeUndefined();

    expect((await payments.findByReference(reference))!.status).toBe("paid");
  });

  it("converges when two deliveries race", async () => {
    const { reference } = await startPayment();
    const paid = { amountKobo: TOTAL_KOBO, currency: "NGN" };

    await Promise.all([
      confirm.execute(reference, true, paid),
      confirm.execute(reference, true, paid),
    ]);

    expect((await payments.findByReference(reference))!.status).toBe("paid");
    expect((await applications.findById("app-1"))!.stage).toBe("installation_scheduling");
  });

  it("finishes the advance on retry after it failed once", async () => {
    const { reference } = await startPayment();
    const paid = { amountKobo: TOTAL_KOBO, currency: "NGN" };
    const save = applications.save.bind(applications);
    applications.save = async () => {
      throw new Error("db blip");
    };

    await expect(confirm.execute(reference, true, paid)).rejects.toThrow("db blip");
    expect((await payments.findByReference(reference))!.status).toBe("paid");
    applications.save = save;

    await confirm.execute(reference, true, paid);
    expect((await applications.findById("app-1"))!.stage).toBe("installation_scheduling");
  });

  it.each([
    ["wrong amount", { amountKobo: TOTAL_KOBO - 1, currency: "NGN" }],
    ["wrong currency", { amountKobo: TOTAL_KOBO, currency: "USD" }],
    ["unknown amount", { amountKobo: null, currency: null }],
    ["no paid details", undefined],
  ])("marks a mismatch and does not advance on %s", async (_label, paid) => {
    const { reference } = await startPayment();

    await expect(confirm.execute(reference, true, paid)).resolves.toBeUndefined();

    expect((await payments.findByReference(reference))!.status).toBe("mismatch");
    expect((await applications.findById("app-1"))!.stage).toBe("payment");
  });

  it("marks a failed callback failed without advancing", async () => {
    const { reference } = await startPayment();

    await confirm.execute(reference, false);

    expect((await payments.findByReference(reference))!.status).toBe("failed");
    expect((await applications.findById("app-1"))!.stage).toBe("payment");
  });

  it("settles a success that follows a failed attempt on the same reference", async () => {
    const { reference } = await startPayment();
    await confirm.execute(reference, false);

    await confirm.execute(reference, true, { amountKobo: TOTAL_KOBO, currency: "NGN" });

    const stored = (await payments.findByReference(reference))!;
    expect(stored.status).toBe("paid");
    expect(stored.invoiceId).not.toBeNull();
    expect((await applications.findById("app-1"))!.stage).toBe("installation_scheduling");
  });

  it("settles a correct success after a mismatch", async () => {
    const { reference } = await startPayment();
    await confirm.execute(reference, true, { amountKobo: TOTAL_KOBO - 1, currency: "NGN" });

    await confirm.execute(reference, true, { amountKobo: TOTAL_KOBO, currency: "NGN" });

    expect((await payments.findByReference(reference))!.status).toBe("paid");
  });

  it("does not let a late failure undo a paid payment", async () => {
    const { reference } = await startPayment();
    await confirm.execute(reference, true, { amountKobo: TOTAL_KOBO, currency: "NGN" });

    await confirm.execute(reference, false);

    expect((await payments.findByReference(reference))!.status).toBe("paid");
  });

  it("ignores an unknown reference", async () => {
    await expect(confirm.execute("FPA-nope", true, { amountKobo: 1, currency: "NGN" })).resolves.toBeUndefined();
  });

  it("propagates a repository error so the webhook can answer 5xx", async () => {
    const { reference } = await startPayment();
    payments.settlePending = async () => {
      throw new Error("db down");
    };

    await expect(
      confirm.execute(reference, true, { amountKobo: TOTAL_KOBO, currency: "NGN" }),
    ).rejects.toThrow("db down");
  });
});
