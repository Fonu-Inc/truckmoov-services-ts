import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryOnboardingApplicationRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-onboarding-application.repository";
import { InMemoryOnboardingPaymentRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-onboarding-payment.repository";
import { InMemoryM2mLicensePlanRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-m2m-license-plan.repository";
import { GetOnboardingApplicationUseCase } from "@auth/onboarding/application/use-cases/get-onboarding-application.use-case";
import { GetApplicationOrderUseCase } from "@auth/onboarding/application/use-cases/pay-for-application.use-cases";
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
    order = new GetApplicationOrderUseCase(
      applications,
      plans,
      payments,
      getApplication,
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

  async function recordPaidPayment() {
    const now = new Date();
    await payments.save({
      id: "pay-1",
      applicationId: "app-1",
      reference: "FPA-APP-2026-AAAA-1",
      provider: "paystack",
      amountKobo: 100,
      billingEmail: "accounts@arne.com",
      planCode: "m2m_standard",
      deviceCount: 2,
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
});
