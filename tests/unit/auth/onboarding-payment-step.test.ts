import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryOnboardingApplicationRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-onboarding-application.repository";
import { InMemoryOnboardingPaymentRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-onboarding-payment.repository";
import { InMemoryBillingSettingsRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-billing-settings.repository";
import { InMemoryM2mLicensePlanRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-m2m-license-plan.repository";
import { GetOnboardingApplicationUseCase } from "@auth/onboarding/application/use-cases/get-onboarding-application.use-case";
import {
  ChargeRefusedError,
  CreateApplicationPaymentUseCase,
  GetApplicationOrderUseCase,
} from "@auth/onboarding/application/use-cases/pay-for-application.use-cases";
import { PaymentGatewayError, type PaymentGateway } from "../../../apps/auth/src/contexts/payments";
import { SetBillingEmailUseCase } from "@auth/onboarding/application/use-cases/set-billing-email.use-case";
import { GetOnboardingApplicationStatusUseCase } from "@auth/onboarding/application/use-cases/submit-onboarding-application.use-case";
import {
  ConfirmOnboardingVerificationCodeUseCase,
  SendOnboardingVerificationCodeUseCase,
  VerificationResendTooSoonError,
} from "@auth/onboarding/application/use-cases/verify-onboarding-application-contact.use-cases";
import {
  ApplicationNotEditableError,
  hashApplicationToken,
} from "@auth/onboarding/domain/onboarding-application.support";
import { buildQuotationKit } from "./quotation-test-kit";
import type { StoredOnboardingApplication } from "@auth/onboarding/domain/onboarding-application.repository";
import type { OnboardingStage } from "@auth/onboarding/domain/onboarding-stage";
import type { VerificationCodeMessage } from "@auth/onboarding/domain/ports/onboarding-verification-notifier.port";

const TOKEN = "applicant-token";

function application(
  overrides: Partial<StoredOnboardingApplication> = {},
): StoredOnboardingApplication {
  const now = new Date();
  return {
    id: "app-1",
    reference: "APP-2026-AAAA",
    tokenHash: hashApplicationToken(TOKEN),
    applicantType: "enterprise",
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
    billingEmailVerifiedAt: null,
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
    ...overrides,
  };
}

describe("Payment step", () => {
  let applications: InMemoryOnboardingApplicationRepository;
  let payments: InMemoryOnboardingPaymentRepository;
  let emails: VerificationCodeMessage[];
  let sendCode: SendOnboardingVerificationCodeUseCase;
  let confirmCode: ConfirmOnboardingVerificationCodeUseCase;
  let setBillingEmail: SetBillingEmailUseCase;
  let order: GetApplicationOrderUseCase;
  let plans: InMemoryM2mLicensePlanRepository;
  let settings: InMemoryBillingSettingsRepository;
  let getView: GetOnboardingApplicationUseCase;
  let status: GetOnboardingApplicationStatusUseCase;

  beforeEach(() => {
    applications = new InMemoryOnboardingApplicationRepository();
    payments = new InMemoryOnboardingPaymentRepository();
    emails = [];
    let ids = 0;
    const getApplication = new GetOnboardingApplicationUseCase(applications);
    sendCode = new SendOnboardingVerificationCodeUseCase(
      applications,
      payments,
      { generate: () => `id-${++ids}` },
      {
        sendEmailCode: async (message) => {
          emails.push(message);
        },
        sendSmsCode: async () => undefined,
      },
      getApplication,
    );
    confirmCode = new ConfirmOnboardingVerificationCodeUseCase(
      applications,
      payments,
      getApplication,
    );
    setBillingEmail = new SetBillingEmailUseCase(
      applications,
      payments,
      getApplication,
    );
    getView = getApplication;
    status = new GetOnboardingApplicationStatusUseCase(
      applications,
      getApplication,
      {} as never,
      {} as never,
      {} as never,
    );
    plans = new InMemoryM2mLicensePlanRepository();
    settings = new InMemoryBillingSettingsRepository();
    order = new GetApplicationOrderUseCase(
      applications,
      plans,
      payments,
      getApplication,
      settings,
    );
  });

  async function seed(overrides: Partial<StoredOnboardingApplication> = {}) {
    await applications.save(application(overrides));
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
  }

  const billing = { applicationId: "app-1", applicationToken: TOKEN };

  async function recordPaidPayment(orderSummary: unknown = null) {
    const now = new Date();
    await payments.save({
      id: "pay-1",
      applicationId: "app-1",
      reference: "FPA-APP-2026-AAAA-1",
      provider: "paystack",
      amountKobo: 100,
      authorizationUrl: null,
      billingEmail: "accounts@arne.com",
      planCode: "m2m_standard",
      deviceCount: 2,
      orderSummary: orderSummary as never,
      quotationId: null,
      invoiceId: null,
      method: null,
      customerName: null,
      note: null,
      autoReconciled: true,
      status: "paid",
      paidAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  it("sends and verifies the billing email on an approved application at the payment stage", async () => {
    await seed();

    const sent = await sendCode.execute({ ...billing, channel: "billing_email" });
    expect(sent.data.resendAfterSeconds).toBe(60);

    const verified = await confirmCode.execute({
      ...billing,
      channel: "billing_email",
      code: emails.at(-1)!.code,
    });
    expect(verified.status).toBe(true);
    const stored = await applications.findById("app-1");
    expect(stored!.billingEmailVerifiedAt).not.toBeNull();
  });

  it("lets the billing email change at the payment stage", async () => {
    await seed();

    const result = await setBillingEmail.execute({
      ...billing,
      billingEmail: "finance@arne.com",
    });

    expect(result.data.billingEmail).toBe("finance@arne.com");
  });

  it.each<OnboardingStage>(["provisioning", "installation_scheduling"])(
    "refuses billing email changes at the %s stage",
    async (stage) => {
      await seed({ stage });

      await expect(
        sendCode.execute({ ...billing, channel: "billing_email" }),
      ).rejects.toBeInstanceOf(ApplicationNotEditableError);
      await expect(
        confirmCode.execute({ ...billing, channel: "billing_email", code: "123456" }),
      ).rejects.toBeInstanceOf(ApplicationNotEditableError);
      await expect(
        setBillingEmail.execute({ ...billing, billingEmail: "finance@arne.com" }),
      ).rejects.toBeInstanceOf(ApplicationNotEditableError);
    },
  );

  it("keeps business email verification closed after approval", async () => {
    await seed();

    await expect(
      sendCode.execute({ ...billing, channel: "email" }),
    ).rejects.toBeInstanceOf(ApplicationNotEditableError);
  });

  it("reports the cooldown in seconds when a code is requested too soon", async () => {
    await seed();
    await sendCode.execute({ ...billing, channel: "billing_email" });

    const error = await sendCode
      .execute({ ...billing, channel: "billing_email" })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(VerificationResendTooSoonError);
    const seconds = (error as VerificationResendTooSoonError).secondsRemaining;
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(60);
  });

  it("returns the stage and whether the order can be paid", async () => {
    await seed();

    const result = await order.execute("app-1", TOKEN);

    expect(result.data.stage).toBe("payment");
    expect(result.data.payable).toBe(true);
  });

  it("prices installation from the audience's setting", async () => {
    await settings.savePriced(
      [
        { key: "installation_fee_enterprise_ngn", value: 20_000 },
        { key: "installation_fee_owner_operator_ngn", value: 9_000 },
      ],
      "admin-1",
      [],
    );

    await seed({ applicantType: "fleet_provider" });
    const fleet = await order.execute("app-1", TOKEN);
    expect(fleet.data.order.installationNgn).toBe(40_000);

    await applications.save(application({ applicantType: "owner_operator" }));
    const owner = await order.execute("app-1", TOKEN);
    expect(owner.data.order.installationNgn).toBe(18_000);
    expect(owner.data.order.totalNgn).toBe(50_000 + 18_000);
  });

  it("keeps the 15,000 installation price when nothing has been set", async () => {
    await seed();

    const result = await order.execute("app-1", TOKEN);

    expect(result.data.order.installationNgn).toBe(30_000);
  });

  it("freezes a paid order against later price changes", async () => {
    await seed();
    const before = await order.execute("app-1", TOKEN);
    await recordPaidPayment(before.data.order);

    await settings.savePriced(
      [{ key: "installation_fee_enterprise_ngn", value: 99_000 }],
      "admin-1",
      [],
    );
    const plan = (await plans.findByCode("m2m_standard"))!;
    await plans.save({ ...plan, perDeviceYear1Ngn: 90_000 });

    const after = await order.execute("app-1", TOKEN);
    expect(after.data.order).toEqual(before.data.order);
    expect(after.data.order.totalNgn).toBe(80_000);
  });

  it("marks the order unpayable before the payment stage", async () => {
    await seed({ stage: "provisioning" });

    const result = await order.execute("app-1", TOKEN);

    expect(result.data.stage).toBe("provisioning");
    expect(result.data.payable).toBe(false);
  });
  it("refuses billing email changes once the payment is paid, even before the stage advances", async () => {
    await seed();
    await recordPaidPayment();

    await expect(
      sendCode.execute({ ...billing, channel: "billing_email" }),
    ).rejects.toBeInstanceOf(ApplicationNotEditableError);
    await expect(
      confirmCode.execute({ ...billing, channel: "billing_email", code: "123456" }),
    ).rejects.toBeInstanceOf(ApplicationNotEditableError);
    await expect(
      setBillingEmail.execute({ ...billing, billingEmail: "finance@arne.com" }),
    ).rejects.toBeInstanceOf(ApplicationNotEditableError);
    const stored = await applications.findById("app-1");
    expect(stored!.billingEmail).toBe("accounts@arne.com");
  });

  it("returns the stage on the application view", async () => {
    await seed();

    const result = await getView.execute("app-1", TOKEN);

    expect(result.data.stage).toBe("payment");
  });

  it("returns the stage on the status response", async () => {
    await seed({ stage: "installation_scheduling" });

    const result = await status.execute("app-1", TOKEN);

    expect(result.data.stage).toBe("installation_scheduling");
  });

  it("answers a charge the provider refuses as refused, recording no payment", async () => {
    await seed({ billingEmailVerifiedAt: new Date() });
    const gateway = {
      name: "paystack",
      isConfigured: () => true,
      initiateCharge: async () => {
        throw new PaymentGatewayError("paystack", "Invalid key");
      },
    } as unknown as PaymentGateway;
    const pay = new CreateApplicationPaymentUseCase(
      applications,
      plans,
      payments,
      gateway,
      getView,
      { generate: () => "pay-1" },
      settings,
      buildQuotationKit(plans, settings, payments).service,
    );

    await expect(pay.execute(billing)).rejects.toBeInstanceOf(ChargeRefusedError);
    expect(await payments.findLatestForApplication("app-1")).toBeNull();
  });
});
