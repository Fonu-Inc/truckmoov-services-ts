import { beforeEach, describe, expect, it, vi } from "vitest";
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
  toPaymentReviewViews,
} from "@auth/onboarding/application/use-cases/review-onboarding-payment.use-case";
import { ApplicationPaymentNoticeService } from "@auth/onboarding/application/services/application-payment-notice.service";
import { RefundSettlementService } from "@auth/onboarding/application/services/refund-settlement.service";
import { RefundReconciliationService } from "@auth/onboarding/application/services/refund-reconciliation.service";
import {
  PaymentNotRefundableError,
  RefundInProgressError,
  RefundOnboardingPaymentUseCase,
  RefundRefusedError,
  RefundStateConflictError,
} from "@auth/onboarding/application/use-cases/refund-onboarding-payment.use-case";
import { PaymentGatewayError } from "../../../apps/auth/src/contexts/payments";
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
  let notifier: { sendPaymentOpen: ReturnType<typeof vi.fn>; sendPaymentRefunded: ReturnType<typeof vi.fn> };
  let notices: ApplicationPaymentNoticeService;
  let alerts: PlatformAlertPublisher;

  beforeEach(async () => {
    applications = new InMemoryOnboardingApplicationRepository();
    payments = new InMemoryOnboardingPaymentRepository();
    availableQuantity = 0;
    raised = [];
    const inventory = {
      availability: async () => ({ tracked: true, availableQuantity }),
      heldBy: async () => 0,
    } as unknown as OnboardingDeviceInventoryService;
    notifier = {
      sendPaymentOpen: vi.fn(async () => ({ delivered: true })),
      sendPaymentRefunded: vi.fn(async () => ({ delivered: true })),
    };
    alerts = { raise: async (alert: RaisedAlert) => void raised.push(alert) } as unknown as PlatformAlertPublisher;
    notices = new ApplicationPaymentNoticeService(applications, notifier as never, alerts);
    provisioning = new OnboardingProvisioningService(applications, inventory, notices);
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

    it("emails the applicant a resume link once when payment opens", async () => {
      availableQuantity = 2;
      const before = (await applications.findById("app-1"))!.tokenHash;

      await complete().execute({ accessToken: "t", applicationId: "app-1" });
      await notices.paymentOpened((await applications.findById("app-1"))!);

      expect(notifier.sendPaymentOpen).toHaveBeenCalledTimes(1);
      const sent = notifier.sendPaymentOpen.mock.calls[0]![0];
      expect(sent).toMatchObject({ email: "jane@arne.com", applicationId: "app-1" });
      expect(sent.applicationToken).toBeTruthy();
      expect((await applications.findById("app-1"))!.tokenHash).not.toBe(before);
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

    it("reviews the payment named in the request when several are mismatched", async () => {
      await payments.save(payment());
      await payments.save(payment({ id: "pay-2", reference: "FPA-2", createdAt: new Date(NOW.getTime() + 1000) }));

      await review().execute({
        accessToken: "t",
        applicationId: "app-1",
        paymentId: "pay-1",
        outcome: "refund_needed",
        note: "Paid the old price",
      });

      expect((await payments.findByReference("FPA-1"))!.reviewOutcome).toBe("refund_needed");
      expect((await payments.findByReference("FPA-2"))!.reviewOutcome ?? null).toBeNull();
    });

    it("lists every mismatched onboarding payment for the review view, never renewals", async () => {
      await payments.save(payment());
      await payments.save(payment({ id: "pay-2", reference: "FPA-2", createdAt: new Date(NOW.getTime() + 1000) }));
      await payments.save(payment({ id: "pay-r", reference: "RNW-INV-1-abc", createdAt: new Date(NOW.getTime() + 2000) }));

      const views = toPaymentReviewViews(await payments.listMismatchedForApplication("app-1", true));

      expect(views.map((view) => view.reference)).toEqual(["FPA-2", "FPA-1"]);
      expect(views[0]).toMatchObject({ paymentId: "pay-2", status: "mismatch" });
    });

    it("refuses when the latest payment is not in mismatch", async () => {
      await payments.save(payment({ status: "paid" }));

      await expect(
        review().execute({ accessToken: "t", applicationId: "app-1", outcome: "resolved", note: "All sorted" }),
      ).rejects.toBeInstanceOf(PaymentNotInMismatchError);
    });
  });

  describe("refund", () => {
    const gateway = (refund: () => Promise<{ status: "pending" | "processed" | "failed"; providerRefundId: string | null }>) => ({
      name: "paystack",
      refund: vi.fn(refund),
      getRefundStatus: vi.fn(async () => ({ status: "pending" as const, providerRefundId: null })),
    });
    const settlement = () => new RefundSettlementService(payments, notices, alerts);
    const refundUseCase = (gw: ReturnType<typeof gateway>) =>
      new RefundOnboardingPaymentUseCase(
        applications,
        payments,
        gw as never,
        settlement(),
        new RefundReconciliationService(gw as never, settlement()),
        tokenService as never,
        users as never,
      );
    const input = { accessToken: "t", applicationId: "app-1", note: "Paid the old price" };
    const flagged = () => payment({ reviewOutcome: "refund_needed", reviewNote: "x", reviewedBy: "staff-1" });

    it("refunds through the provider, marks the payment refunded and emails the applicant", async () => {
      await payments.save(flagged());
      const gw = gateway(async () => ({ status: "processed" as const, providerRefundId: "9001" }));

      const res = await refundUseCase(gw).execute(input);

      expect(gw.refund).toHaveBeenCalledWith("FPA-1");
      expect(res.data).toMatchObject({ refundReference: "9001", alreadyRefunded: false });
      expect(await payments.findByReference("FPA-1")).toMatchObject({
        status: "refunded",
        refundReference: "9001",
      });
      expect(notifier.sendPaymentRefunded).toHaveBeenCalledTimes(1);
    });

    it("answers a second refund without calling the provider again", async () => {
      await payments.save(flagged());
      const gw = gateway(async () => ({ status: "processed" as const, providerRefundId: "9001" }));
      const useCase = refundUseCase(gw);

      await useCase.execute(input);
      const again = await useCase.execute(input);

      expect(again.data.alreadyRefunded).toBe(true);
      expect(gw.refund).toHaveBeenCalledTimes(1);
      expect(notifier.sendPaymentRefunded).toHaveBeenCalledTimes(1);
    });

    it("keeps the provider's refusal on the payment and leaves it in mismatch", async () => {
      await payments.save(flagged());
      const gw = gateway(async () => {
        throw new PaymentGatewayError("paystack", "Transaction has already been fully reversed");
      });

      await expect(refundUseCase(gw).execute(input)).rejects.toBeInstanceOf(RefundRefusedError);

      expect(await payments.findByReference("FPA-1")).toMatchObject({
        status: "mismatch",
        refundError: "Transaction has already been fully reversed",
      });
      expect(notifier.sendPaymentRefunded).not.toHaveBeenCalled();
    });

    it("releases the claim when the provider call fails for any other reason, so staff can retry", async () => {
      await payments.save(flagged());
      const failing = gateway(async () => {
        throw new Error("socket hang up");
      });

      await expect(refundUseCase(failing).execute(input)).rejects.toThrow("socket hang up");

      const retry = gateway(async () => ({ status: "processed" as const, providerRefundId: "9001" }));
      const res = await refundUseCase(retry).execute(input);
      expect(res.data).toMatchObject({ refundReference: "9001", alreadyRefunded: false });
    });

    it("keeps the claim and stays in mismatch while the provider has only queued the refund", async () => {
      await payments.save(flagged());
      const gw = gateway(async () => ({ status: "pending" as const, providerRefundId: "9002" }));
      const useCase = refundUseCase(gw);

      const res = await useCase.execute(input);

      expect(res.data).toMatchObject({ refundStatus: "processing", refundReference: "9002", alreadyRefunded: false });
      expect(await payments.findByReference("FPA-1")).toMatchObject({ status: "mismatch", refundReference: "9002" });
      expect((await payments.findByReference("FPA-1"))!.refundPendingAt).toBeTruthy();
      expect(notifier.sendPaymentRefunded).not.toHaveBeenCalled();
      await expect(useCase.execute(input)).rejects.toBeInstanceOf(RefundInProgressError);
      expect(gw.refund).toHaveBeenCalledTimes(1);
    });

    it("finishes a queued refund and emails once when the processed webhook arrives, even if delivered twice", async () => {
      await payments.save(flagged());
      await refundUseCase(gateway(async () => ({ status: "pending" as const, providerRefundId: "9002" }))).execute(input);

      await settlement().onCallback("FPA-1", { status: "processed", providerRefundId: "9002" });
      await settlement().onCallback("FPA-1", { status: "processed", providerRefundId: "9002" });

      expect(await payments.findByReference("FPA-1")).toMatchObject({ status: "refunded", refundReference: "9002" });
      expect(notifier.sendPaymentRefunded).toHaveBeenCalledTimes(1);
    });

    it("releases the claim and records the error when the failed webhook arrives, so staff can retry", async () => {
      await payments.save(flagged());
      await refundUseCase(gateway(async () => ({ status: "pending" as const, providerRefundId: "9002" }))).execute(input);

      await settlement().onCallback("FPA-1", { status: "failed", providerRefundId: "9002" });

      const stored = await payments.findByReference("FPA-1");
      expect(stored).toMatchObject({ status: "mismatch", refundPendingAt: null });
      expect(stored!.refundError).toBeTruthy();
      const retry = gateway(async () => ({ status: "processed" as const, providerRefundId: "9003" }));
      expect((await refundUseCase(retry).execute(input)).data.refundStatus).toBe("refunded");
    });

    it("treats a provider that reports the refund failed straight away as a refusal", async () => {
      await payments.save(flagged());
      const gw = gateway(async () => ({ status: "failed" as const, providerRefundId: null }));

      await expect(refundUseCase(gw).execute(input)).rejects.toBeInstanceOf(RefundRefusedError);

      expect(await payments.findByReference("FPA-1")).toMatchObject({ status: "mismatch", refundPendingAt: null });
    });

    it("ignores refund events for unknown references and for renewal payments", async () => {
      await payments.save(flagged());
      await payments.save(payment({ id: "pay-r", reference: "RNW-INV-1-abc", status: "mismatch", reviewOutcome: "refund_needed" }));

      await settlement().onCallback("nope", { status: "processed", providerRefundId: "1" });
      await settlement().onCallback("RNW-INV-1-abc", { status: "processed", providerRefundId: "1" });

      expect((await payments.findByReference("RNW-INV-1-abc"))!.status).toBe("mismatch");
      expect((await payments.findByReference("FPA-1"))!.status).toBe("mismatch");
    });

    it("targets the payment named in the request, not just the latest", async () => {
      await payments.save(flagged());
      await payments.save(payment({ id: "pay-2", reference: "FPA-2", createdAt: new Date(NOW.getTime() + 1000) }));
      const gw = gateway(async () => ({ status: "processed" as const, providerRefundId: "9001" }));

      const res = await refundUseCase(gw).execute({ ...input, paymentId: "pay-1" });

      expect(gw.refund).toHaveBeenCalledWith("FPA-1");
      expect(res.data.paymentId).toBe("pay-1");
      expect((await payments.findByReference("FPA-2"))!.status).toBe("mismatch");
    });

    it("without a payment id picks the newest mismatched payment awaiting refund, skipping an already refunded one", async () => {
      await payments.save(flagged());
      await payments.save(
        payment({ id: "pay-2", reference: "FPA-2", status: "refunded", reviewOutcome: "refund_needed", createdAt: new Date(NOW.getTime() + 1000) }),
      );
      const gw = gateway(async () => ({ status: "processed" as const, providerRefundId: "9001" }));

      await refundUseCase(gw).execute(input);

      expect(gw.refund).toHaveBeenCalledWith("FPA-1");
    });

    it("refuses to refund a renewal payment through the onboarding endpoint", async () => {
      await payments.save(payment({ id: "pay-r", reference: "RNW-INV-1-abc", reviewOutcome: "refund_needed" }));
      await payments.save(payment({ id: "pay-i", reference: "FPA-9", invoiceId: "inv-1", reviewOutcome: "refund_needed" }));
      const gw = gateway(async () => ({ status: "processed" as const, providerRefundId: "9001" }));

      await expect(refundUseCase(gw).execute({ ...input, paymentId: "pay-r" })).rejects.toBeInstanceOf(PaymentNotRefundableError);
      await expect(refundUseCase(gw).execute({ ...input, paymentId: "pay-i" })).rejects.toBeInstanceOf(PaymentNotRefundableError);
      await expect(refundUseCase(gw).execute(input)).rejects.toBeInstanceOf(PaymentNotRefundableError);
      expect(gw.refund).not.toHaveBeenCalled();
    });

    it("flags the payment and raises a high alert when it left mismatch while the provider refunded", async () => {
      await payments.save(flagged());
      const gw = gateway(async () => {
        await payments.save({ ...(await payments.findByReference("FPA-1"))!, status: "paid" });
        return { status: "processed" as const, providerRefundId: "9001" };
      });

      await expect(refundUseCase(gw).execute(input)).rejects.toBeInstanceOf(RefundStateConflictError);

      expect((await payments.findByReference("FPA-1"))!.refundError).toBe("refunded at provider but status changed");
      expect(raised).toHaveLength(1);
      expect(raised[0]).toMatchObject({ alertType: "billing_alerts", severity: "high" });
      expect(notifier.sendPaymentRefunded).not.toHaveBeenCalled();
    });

    it("refuses a mismatch not marked as needing a refund, and a missing note", async () => {
      await payments.save(payment({ reviewOutcome: "resolved" }));
      const gw = gateway(async () => ({ status: "processed" as const, providerRefundId: null }));

      await expect(refundUseCase(gw).execute(input)).rejects.toBeInstanceOf(PaymentNotRefundableError);
      await expect(refundUseCase(gw).execute({ ...input, note: " " })).rejects.toMatchObject({ field: "note" });
      expect(gw.refund).not.toHaveBeenCalled();
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
      expect(notifier.sendPaymentOpen).toHaveBeenCalledTimes(1);
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
