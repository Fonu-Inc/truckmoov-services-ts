import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryOnboardingApplicationRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-onboarding-application.repository";
import { InMemoryOnboardingPaymentRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-onboarding-payment.repository";
import { OnboardingProvisioningService } from "@auth/onboarding/application/services/onboarding-provisioning.service";
import type { OnboardingDeviceInventoryService } from "@auth/onboarding/application/services/onboarding-device-inventory.service";
import {
  ApplicationNotProvisionableError,
  CompleteProvisioningUseCase,
  ProvisioningReasonRequiredError,
} from "@auth/onboarding/application/use-cases/complete-provisioning.use-case";
import {
  PaymentNotInMismatchError,
  ReviewOnboardingPaymentMismatchUseCase,
} from "@auth/onboarding/application/use-cases/review-onboarding-payment.use-case";
import { OnboardingStageSweepService } from "@auth/onboarding/infrastructure/sweeps/onboarding-stage-sweep.service";
import type { StoredOnboardingApplication } from "@auth/onboarding/domain/onboarding-application.repository";
import type { StoredOnboardingPayment } from "@auth/onboarding/domain/onboarding-payment.repository";
import type { PlatformAlertPublisher, RaisedAlert } from "../../../apps/auth/src/platform-alert.publisher";

const NOW = new Date("2026-10-02T12:00:00Z");
const HOUR_MS = 60 * 60 * 1000;

function application(over: Partial<StoredOnboardingApplication> = {}): StoredOnboardingApplication {
  return {
    id: "app-1",
    reference: "APP-2026-AAAA",
    tokenHash: "hash",
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
    billingEmail: null,
    billingEmailVerifiedAt: null,
    emailVerifiedAt: NOW,
    phoneVerifiedAt: NOW,
    status: "approved",
    stage: "provisioning",
    submittedAt: NOW,
    reviewedBy: null,
    reviewedAt: null,
    decisionReason: null,
    tenantId: "tenant-1",
    setupLinkStatus: null,
    setupLinkSentAt: null,
    setupLinkError: null,
    setupLinkAttempts: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function payment(over: Partial<StoredOnboardingPayment> = {}): StoredOnboardingPayment {
  return {
    id: "pay-1",
    applicationId: "app-1",
    reference: "FPA-1",
    provider: "paystack",
    amountKobo: 8_000_000,
    authorizationUrl: null,
    billingEmail: "accounts@arne.com",
    planCode: "m2m_standard",
    deviceCount: 2,
    orderSummary: null,
    quotationId: null,
    invoiceId: null,
    method: null,
    customerName: null,
    note: null,
    autoReconciled: false,
    status: "mismatch",
    paidAt: null,
    receivedAmountKobo: 7_999_900,
    receivedCurrency: "NGN",
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

const tokenService = { resolveAccessToken: () => ({ id: "staff-1" }) as never };
const users = {
  findById: async () => ({
    id: "staff-1",
    email: "admin@system",
    passwordHash: "x",
    role: "SYSTEM_ADMIN",
    tenantId: "system",
    accountStatus: "enabled",
  }),
};

describe("Onboarding provisioning and payment review", () => {
  let applications: InMemoryOnboardingApplicationRepository;
  let payments: InMemoryOnboardingPaymentRepository;
  let availableQuantity: number;
  let provisioning: OnboardingProvisioningService;
  let raised: RaisedAlert[];

  beforeEach(async () => {
    applications = new InMemoryOnboardingApplicationRepository();
    payments = new InMemoryOnboardingPaymentRepository();
    availableQuantity = 0;
    raised = [];
    const inventory = {
      availability: async () => ({ tracked: true, availableQuantity }),
    } as unknown as OnboardingDeviceInventoryService;
    provisioning = new OnboardingProvisioningService(applications, inventory);
    await applications.save(application());
    await applications.saveDeviceRequest({
      id: "req-1",
      applicationId: "app-1",
      quantity: 2,
      useCase: "Fleet tracking",
      notes: null,
      createdAt: NOW,
      updatedAt: NOW,
    } as never);
  });

  const complete = () =>
    new CompleteProvisioningUseCase(applications, tokenService as never, users as never, provisioning);

  describe("mark provisioned", () => {
    it("opens payment without a reason when stock covers the order", async () => {
      availableQuantity = 2;

      const res = await complete().execute({ accessToken: "t", applicationId: "app-1" });

      expect(res.data).toMatchObject({ stage: "payment", confirmedWithoutStock: false });
      expect((await applications.findById("app-1"))!.stage).toBe("payment");
    });

    it("demands a reason when stock is short", async () => {
      await expect(complete().execute({ accessToken: "t", applicationId: "app-1" })).rejects.toBeInstanceOf(
        ProvisioningReasonRequiredError,
      );
      await expect(
        complete().execute({ accessToken: "t", applicationId: "app-1", reason: "no" }),
      ).rejects.toBeInstanceOf(ProvisioningReasonRequiredError);
      expect((await applications.findById("app-1"))!.stage).toBe("provisioning");
    });

    it("opens payment on a staff reason when stock is short and returns it for the audit trail", async () => {
      const res = await complete().execute({
        accessToken: "t",
        applicationId: "app-1",
        reason: "Stock lands Monday",
      });

      expect(res.data).toMatchObject({ confirmedWithoutStock: true, reason: "Stock lands Monday" });
      expect((await applications.findById("app-1"))!.stage).toBe("payment");
    });

    it("refuses an application that is not at provisioning", async () => {
      await applications.save(application({ stage: "payment" }));

      await expect(
        complete().execute({ accessToken: "t", applicationId: "app-1", reason: "Stock lands Monday" }),
      ).rejects.toBeInstanceOf(ApplicationNotProvisionableError);
    });
  });

  describe("payment mismatch review", () => {
    const review = () =>
      new ReviewOnboardingPaymentMismatchUseCase(applications, payments, tokenService as never, users as never);

    it("records the outcome and note against the mismatched payment", async () => {
      await payments.save(payment());

      await review().execute({
        accessToken: "t",
        applicationId: "app-1",
        outcome: "refund_needed",
        note: "Paid the old price",
      });

      expect(await payments.findByReference("FPA-1")).toMatchObject({
        reviewOutcome: "refund_needed",
        reviewNote: "Paid the old price",
        reviewedBy: "staff-1",
      });
    });

    it("rejects an unknown outcome and a missing note", async () => {
      await payments.save(payment());

      await expect(
        review().execute({ accessToken: "t", applicationId: "app-1", outcome: "ignored", note: "Paid the old price" }),
      ).rejects.toMatchObject({ field: "outcome" });
      await expect(
        review().execute({ accessToken: "t", applicationId: "app-1", outcome: "resolved", note: " " }),
      ).rejects.toMatchObject({ field: "note" });
    });

    it("refuses when the latest payment is not in mismatch", async () => {
      await payments.save(payment({ status: "paid" }));

      await expect(
        review().execute({ accessToken: "t", applicationId: "app-1", outcome: "resolved", note: "All sorted" }),
      ).rejects.toBeInstanceOf(PaymentNotInMismatchError);
    });
  });

  describe("daily stage sweep", () => {
    const sweep = () =>
      new OnboardingStageSweepService(
        { persistence: { backend: "in-memory" } } as never,
        applications,
        provisioning,
        { raise: async (alert: RaisedAlert) => void raised.push(alert) } as unknown as PlatformAlertPublisher,
      );

    it("advances an application waiting for stock once it arrives", async () => {
      await applications.save(application({ id: "app-2", reference: "APP-2026-BBBB", stage: "payment" }));
      availableQuantity = 2;

      const summary = await sweep().run(NOW);

      expect(summary.advanced).toBe(1);
      expect((await applications.findById("app-1"))!.stage).toBe("payment");
    });

    it("leaves applications waiting while stock is short", async () => {
      const summary = await sweep().run(NOW);

      expect(summary.advanced).toBe(0);
      expect((await applications.findById("app-1"))!.stage).toBe("provisioning");
    });

    it("raises an alert for a setup email that failed over 24 hours ago, not a recent one", async () => {
      await applications.save(
        application({
          id: "old",
          reference: "APP-2026-OLD1",
          stage: "installation",
          setupLinkStatus: "failed",
          setupLinkSentAt: new Date(NOW.getTime() - 25 * HOUR_MS),
          setupLinkError: "mailbox full",
        }),
      );
      await applications.save(
        application({
          id: "recent",
          reference: "APP-2026-NEW1",
          stage: "installation",
          setupLinkStatus: "failed",
          setupLinkSentAt: new Date(NOW.getTime() - 2 * HOUR_MS),
        }),
      );

      const summary = await sweep().run(NOW);

      expect(summary.remindedSetupLinks).toBe(1);
      expect(raised).toHaveLength(1);
      expect(raised[0]).toMatchObject({ alertType: "installation_issues" });
      expect(raised[0]!.context).toMatchObject({ reference: "APP-2026-OLD1" });
    });
  });
});
