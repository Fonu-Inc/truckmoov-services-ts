import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryOnboardingApplicationRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-onboarding-application.repository";
import { InMemoryOnboardingPaymentRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-onboarding-payment.repository";
import { ApplicationPaymentNoticeService } from "@auth/onboarding/application/services/application-payment-notice.service";
import { RefundSettlementService } from "@auth/onboarding/application/services/refund-settlement.service";
import { RefundReconciliationService } from "@auth/onboarding/application/services/refund-reconciliation.service";
import { RefundReconciliationSweep } from "@auth/onboarding/infrastructure/sweeps/refund-reconciliation-sweep.service";
import { PaymentNoticeRetrySweep } from "@auth/onboarding/infrastructure/sweeps/payment-notice-retry-sweep.service";
import {
  PaymentLinkNotResendableError,
  PaymentLinkResentTooSoonError,
  ResendPaymentLinkUseCase,
} from "@auth/onboarding/application/use-cases/resend-payment-link.use-case";
import {
  RefundInProgressError,
  RefundOnboardingPaymentUseCase,
} from "@auth/onboarding/application/use-cases/refund-onboarding-payment.use-case";
import { assertChannelOpen } from "@auth/onboarding/application/use-cases/support/assert-channel-open";
import { PaymentGatewayError } from "../../../apps/auth/src/contexts/payments";
import { hashApplicationToken } from "@auth/onboarding/domain/onboarding-application.support";
import type { StoredOnboardingApplication } from "@auth/onboarding/domain/onboarding-application.repository";
import type { StoredOnboardingPayment } from "@auth/onboarding/domain/onboarding-payment.repository";
import type { PlatformAlertPublisher, RaisedAlert } from "../../../apps/auth/src/platform-alert.publisher";

const NOW = new Date("2026-10-02T12:00:00Z");
const MIN = 60 * 1000;
const HOUR = 60 * MIN;

function application(over: Partial<StoredOnboardingApplication> = {}): StoredOnboardingApplication {
  return {
    id: "app-1",
    reference: "APP-2026-AAAA",
    tokenHash: "old-hash",
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
    stage: "payment",
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
    reviewOutcome: "refund_needed",
    refundPendingAt: new Date(NOW.getTime() - 40 * MIN),
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

type Lookup = { status: "pending" | "processed" | "failed" | "unknown"; providerRefundId: string | null };

describe("refund reconciliation, notice delivery and onboarding payment lookups", () => {
  let applications: InMemoryOnboardingApplicationRepository;
  let payments: InMemoryOnboardingPaymentRepository;
  let raised: RaisedAlert[];
  let alerts: PlatformAlertPublisher;
  let sendPaymentOpen: ReturnType<typeof vi.fn>;
  let sendPaymentRefunded: ReturnType<typeof vi.fn>;
  let notices: ApplicationPaymentNoticeService;
  let lookup: ReturnType<typeof vi.fn>;
  let gateway: { name: string; refund: ReturnType<typeof vi.fn>; getRefundStatus: ReturnType<typeof vi.fn> };

  const delivered = async () => ({ delivered: true as const });
  const undelivered = async () => ({ delivered: false as const, error: "smtp down" });

  beforeEach(async () => {
    applications = new InMemoryOnboardingApplicationRepository();
    payments = new InMemoryOnboardingPaymentRepository();
    raised = [];
    alerts = { raise: async (alert: RaisedAlert) => void raised.push(alert) } as unknown as PlatformAlertPublisher;
    sendPaymentOpen = vi.fn(delivered);
    sendPaymentRefunded = vi.fn(delivered);
    notices = new ApplicationPaymentNoticeService(
      applications,
      { sendPaymentOpen, sendPaymentRefunded } as never,
      alerts,
    );
    lookup = vi.fn(async (): Promise<Lookup> => ({ status: "pending", providerRefundId: null }));
    gateway = {
      name: "paystack",
      refund: vi.fn(async () => ({ status: "processed" as const, providerRefundId: "9001" })),
      getRefundStatus: lookup,
    };
    await applications.save(application());
  });

  const settlement = () => new RefundSettlementService(payments, notices, alerts);
  const reconciliation = () => new RefundReconciliationService(gateway as never, settlement());
  const sweep = () =>
    new RefundReconciliationSweep({ persistence: { backend: "in-memory" } } as never, payments, reconciliation());

  describe("refund claim reconciliation", () => {
    it("settles a stale claim the provider has processed, and emails once", async () => {
      await payments.save(payment());
      lookup.mockResolvedValue({ status: "processed", providerRefundId: "9001" });

      const summary = await sweep().run(NOW);
      await sweep().run(NOW);

      expect(summary).toMatchObject({ checked: 1, settled: 1 });
      expect(lookup).toHaveBeenCalledWith("FPA-1");
      expect(await payments.findByReference("FPA-1")).toMatchObject({
        status: "refunded",
        refundReference: "9001",
        refundPendingAt: null,
      });
      expect(sendPaymentRefunded).toHaveBeenCalledTimes(1);
    });

    it("releases a stale claim the provider failed and records why", async () => {
      await payments.save(payment());
      lookup.mockResolvedValue({ status: "failed", providerRefundId: "9001" });

      const summary = await sweep().run(NOW);

      expect(summary.released).toBe(1);
      const stored = await payments.findByReference("FPA-1");
      expect(stored).toMatchObject({ status: "mismatch", refundPendingAt: null });
      expect(stored!.refundError).toBeTruthy();
      expect(sendPaymentRefunded).not.toHaveBeenCalled();
    });

    it("keeps a claim the provider still reports pending", async () => {
      await payments.save(payment());

      const summary = await sweep().run(NOW);

      expect(summary).toMatchObject({ checked: 1, settled: 0, released: 0 });
      expect((await payments.findByReference("FPA-1"))!.refundPendingAt).toBeTruthy();
    });

    it("never asks about or touches a claim younger than 30 minutes", async () => {
      await payments.save(payment({ refundPendingAt: new Date(NOW.getTime() - 29 * MIN) }));
      lookup.mockResolvedValue({ status: "failed", providerRefundId: null });

      expect((await sweep().run(NOW)).checked).toBe(0);
      expect(await reconciliation().reconcile((await payments.findByReference("FPA-1"))!, NOW)).toBe("skipped");

      expect(lookup).not.toHaveBeenCalled();
      expect((await payments.findByReference("FPA-1"))!.refundPendingAt).toBeTruthy();
    });

    it("waits while the provider has no record for under 24 hours", async () => {
      await payments.save(payment({ refundPendingAt: new Date(NOW.getTime() - 23 * HOUR) }));
      lookup.mockResolvedValue({ status: "unknown", providerRefundId: null });

      await sweep().run(NOW);

      expect((await payments.findByReference("FPA-1"))!.refundPendingAt).toBeTruthy();
      expect(raised).toHaveLength(0);
    });

    it("releases the claim and alerts staff once the provider has had no record for over 24 hours", async () => {
      await payments.save(payment({ refundPendingAt: new Date(NOW.getTime() - 25 * HOUR) }));
      lookup.mockResolvedValue({ status: "unknown", providerRefundId: null });

      await sweep().run(NOW);
      await sweep().run(NOW);

      expect(await payments.findByReference("FPA-1")).toMatchObject({
        status: "mismatch",
        refundPendingAt: null,
        refundError: "no refund found at provider: check Paystack before retrying",
      });
      expect(raised).toHaveLength(1);
      expect(raised[0]).toMatchObject({ alertType: "billing_alerts", severity: "high" });
    });

    it("leaves the claim alone when the provider cannot be asked, and carries on with the rest", async () => {
      await payments.save(payment());
      await payments.save(payment({ id: "pay-2", reference: "FPA-2" }));
      lookup.mockRejectedValueOnce(new PaymentGatewayError("paystack", "timeout"));
      lookup.mockResolvedValueOnce({ status: "processed", providerRefundId: "9002" });

      const summary = await sweep().run(NOW);

      expect(summary).toMatchObject({ checked: 2, settled: 1 });
      expect((await payments.findByReference("FPA-1"))!.refundPendingAt).toBeTruthy();
      expect((await payments.findByReference("FPA-2"))!.status).toBe("refunded");
    });

    it("skips renewal and invoice-linked payments and other providers", async () => {
      await payments.save(payment({ id: "pay-r", reference: "RNW-INV-1-abc" }));
      await payments.save(payment({ id: "pay-i", reference: "FPA-9", invoiceId: "inv-1" }));
      await payments.save(payment({ id: "pay-o", reference: "FPA-8", provider: "other" }));

      await sweep().run(NOW);

      expect(lookup).not.toHaveBeenCalled();
      expect(await reconciliation().reconcile((await payments.findByReference("FPA-8"))!, NOW)).toBe("skipped");
    });

    it("does not release a claim that was retaken after the sweep read it", async () => {
      await payments.save(payment());
      const stale = (await payments.findByReference("FPA-1"))!;
      await payments.save({ ...stale, refundPendingAt: new Date(NOW.getTime() - 1 * MIN) });
      lookup.mockResolvedValue({ status: "failed", providerRefundId: null });

      await reconciliation().reconcile(stale, NOW);

      expect((await payments.findByReference("FPA-1"))!.refundPendingAt).toBeTruthy();
    });

    describe("admin refund against a held claim", () => {
      const useCase = () =>
        new RefundOnboardingPaymentUseCase(
          applications,
          payments,
          gateway as never,
          settlement(),
          reconciliation(),
          tokenService as never,
          users as never,
        );
      const input = { accessToken: "t", applicationId: "app-1", note: "Paid the old price" };
      const staleNow = () => new Date(Date.now() - 40 * MIN);

      it("refuses while the claim is younger than 30 minutes and never asks the provider", async () => {
        await payments.save(payment({ refundPendingAt: new Date() }));

        await expect(useCase().execute(input)).rejects.toBeInstanceOf(RefundInProgressError);

        expect(lookup).not.toHaveBeenCalled();
        expect(gateway.refund).not.toHaveBeenCalled();
        expect((await payments.findByReference("FPA-1"))!.refundPendingAt).toBeTruthy();
      });

      it("answers refunded when a stale claim turns out to have been processed", async () => {
        await payments.save(payment({ refundPendingAt: staleNow() }));
        lookup.mockResolvedValue({ status: "processed", providerRefundId: "9001" });

        const res = await useCase().execute(input);

        expect(res.data).toMatchObject({ refundStatus: "refunded", alreadyRefunded: true });
        expect(gateway.refund).not.toHaveBeenCalled();
      });

      it("retries the refund when a stale claim turns out to have failed", async () => {
        await payments.save(payment({ refundPendingAt: staleNow() }));
        lookup.mockResolvedValue({ status: "failed", providerRefundId: null });

        const res = await useCase().execute(input);

        expect(gateway.refund).toHaveBeenCalledTimes(1);
        expect(res.data.refundStatus).toBe("refunded");
      });

      it("still refuses a stale claim the provider reports pending", async () => {
        await payments.save(payment({ refundPendingAt: staleNow() }));

        await expect(useCase().execute(input)).rejects.toBeInstanceOf(RefundInProgressError);
        expect(gateway.refund).not.toHaveBeenCalled();
      });
    });
  });

  describe("latest payment lookups", () => {
    it("ignores renewal payments that share the application id", async () => {
      await payments.save(payment({ id: "p1", reference: "FPA-1", status: "paid", createdAt: new Date(NOW.getTime() - HOUR) }));
      await payments.save(payment({ id: "p2", reference: "RNW-INV-1-abc", status: "pending", invoiceId: "inv-1", createdAt: NOW }));
      await payments.save(payment({ id: "p3", reference: "RNW-W-INV-2", status: "paid", createdAt: new Date(NOW.getTime() + HOUR) }));

      expect((await payments.findLatestForApplication("app-1"))!.id).toBe("p1");
    });

    it("keeps counting a paid onboarding payment after its invoice is linked", async () => {
      await payments.save(payment({ id: "p1", reference: "FPA-1", status: "paid", invoiceId: "inv-1" }));

      expect((await payments.findLatestForApplication("app-1"))!.status).toBe("paid");
    });

    it("answers null when only renewals exist", async () => {
      await payments.save(payment({ id: "p2", reference: "RNW-INV-1-abc" }));

      expect(await payments.findLatestForApplication("app-1")).toBeNull();
    });

    it("lets the billing email change when the only payment is a renewal's", async () => {
      await payments.save(payment({ id: "p2", reference: "RNW-INV-1-abc", status: "paid" }));

      await expect(assertChannelOpen(payments, application(), "billing_email")).resolves.toBeUndefined();
    });
  });

  describe("payment notice send-then-commit", () => {
    it("stores the new token and marks the notice sent only after the mail was accepted", async () => {
      const outcome = await notices.paymentOpened(application(), NOW);

      expect(outcome).toBe("sent");
      const sent = sendPaymentOpen.mock.calls[0]![0];
      const stored = (await applications.findById("app-1"))!;
      expect(stored.tokenHash).toBe(hashApplicationToken(sent.applicationToken));
      expect(stored.paymentNotifiedAt).toEqual(NOW);
      expect(stored.paymentNoticeError).toBeNull();
    });

    it("keeps the old token and leaves the notice owed when the mail fails", async () => {
      sendPaymentOpen.mockImplementation(undelivered);

      const outcome = await notices.paymentOpened(application(), NOW);

      expect(outcome).toBe("failed");
      expect(await applications.findById("app-1")).toMatchObject({
        tokenHash: "old-hash",
        paymentNoticeError: "smtp down",
        paymentNoticeAttempts: 1,
      });
      expect((await applications.findById("app-1"))!.paymentNotifiedAt).toBeFalsy();
    });

    it("keeps the old token when the mailer throws", async () => {
      sendPaymentOpen.mockRejectedValue(new Error("boom"));

      expect(await notices.paymentOpened(application(), NOW)).toBe("failed");
      expect((await applications.findById("app-1"))!.tokenHash).toBe("old-hash");
    });

    it("sends once: a second call after success is skipped", async () => {
      await notices.paymentOpened(application(), NOW);

      expect(await notices.paymentOpened(application(), new Date(NOW.getTime() + 10 * MIN))).toBe("skipped");
      expect(sendPaymentOpen).toHaveBeenCalledTimes(1);
    });

    it("rotates the token for the refunded notice only after the mail was accepted", async () => {
      sendPaymentRefunded.mockImplementationOnce(undelivered);

      expect(await notices.paymentRefunded("app-1")).toBe(false);
      expect((await applications.findById("app-1"))!.tokenHash).toBe("old-hash");

      expect(await notices.paymentRefunded("app-1")).toBe(true);
      const sent = sendPaymentRefunded.mock.calls[1]![0];
      expect((await applications.findById("app-1"))!.tokenHash).toBe(hashApplicationToken(sent.applicationToken));
    });

    it("sends the notice to the verified billing email when there is one", async () => {
      await applications.save(application({ billingEmail: "accounts@arne.com", billingEmailVerifiedAt: NOW }));

      await notices.paymentOpened((await applications.findById("app-1"))!, NOW);

      expect(sendPaymentOpen.mock.calls[0]![0].email).toBe("accounts@arne.com");
    });
  });

  describe("payment notice retry sweep", () => {
    const retry = () =>
      new PaymentNoticeRetrySweep({ persistence: { backend: "in-memory" } } as never, applications, notices);

    it("retries a failed notice once its backoff has passed and stops when it succeeds", async () => {
      sendPaymentOpen.mockImplementationOnce(undelivered);
      await notices.paymentOpened(application(), NOW);

      expect((await retry().run(new Date(NOW.getTime() + 5 * MIN))).due).toBe(0);

      const summary = await retry().run(new Date(NOW.getTime() + 16 * MIN));
      expect(summary).toEqual({ due: 1, sent: 1 });
      expect((await applications.findById("app-1"))!.paymentNotifiedAt).toBeTruthy();
      expect((await retry().run(new Date(NOW.getTime() + 2 * HOUR))).due).toBe(0);
    });

    it("backs off further after each failure", async () => {
      sendPaymentOpen.mockImplementation(undelivered);
      await notices.paymentOpened(application(), NOW);
      await retry().run(new Date(NOW.getTime() + 16 * MIN));

      expect((await retry().run(new Date(NOW.getTime() + 16 * MIN + 20 * MIN))).due).toBe(0);
      expect((await retry().run(new Date(NOW.getTime() + 16 * MIN + 31 * MIN))).due).toBe(1);
    });

    it("picks up an application whose notice was never attempted", async () => {
      const summary = await retry().run(NOW);

      expect(summary).toEqual({ due: 1, sent: 1 });
    });

    it("alerts staff once on the sixth failure and then stops retrying", async () => {
      sendPaymentOpen.mockImplementation(undelivered);
      let at = NOW.getTime();
      await notices.paymentOpened(application(), new Date(at));
      for (let i = 0; i < 10; i++) {
        at += 3 * HOUR;
        await retry().run(new Date(at));
      }

      expect(sendPaymentOpen).toHaveBeenCalledTimes(6);
      expect((await applications.findById("app-1"))!.paymentNoticeAttempts).toBe(6);
      expect(raised).toHaveLength(1);
      expect(raised[0]).toMatchObject({ alertType: "installation_issues" });
      expect(raised[0]!.body).toContain("Resend payment link");
    });

    it("ignores applications that left the payment stage or were already notified", async () => {
      await applications.save(application({ id: "a2", reference: "APP-2", stage: "installation" }));
      await applications.save(application({ id: "a3", reference: "APP-3", paymentNotifiedAt: NOW }));
      await applications.save(application({ id: "app-1", paymentNotifiedAt: NOW }));

      expect((await retry().run(NOW)).due).toBe(0);
    });
  });

  describe("staff resend of the payment link", () => {
    const resend = () => new ResendPaymentLinkUseCase(applications, notices, tokenService as never, users as never);
    const input = { accessToken: "t", applicationId: "app-1" };

    it("sends a new link, commits the token and reports who did it", async () => {
      const res = await resend().execute(input);

      expect(res.data).toMatchObject({ applicationId: "app-1", delivered: true, resentBy: "staff-1" });
      const sent = sendPaymentOpen.mock.calls[0]![0];
      expect((await applications.findById("app-1"))!.tokenHash).toBe(hashApplicationToken(sent.applicationToken));
    });

    it("works after the first notice already went out", async () => {
      await notices.paymentOpened(application(), new Date(Date.now() - HOUR));

      const res = await resend().execute(input);

      expect(res.data.delivered).toBe(true);
      expect(sendPaymentOpen).toHaveBeenCalledTimes(2);
    });

    it("reports a failed send without losing the old token", async () => {
      sendPaymentOpen.mockImplementation(undelivered);

      const res = await resend().execute(input);

      expect(res.data.delivered).toBe(false);
      expect(res.message).toBe("The payment link could not be delivered");
      expect((await applications.findById("app-1"))!.tokenHash).toBe("old-hash");
    });

    it("refuses a second send within two minutes", async () => {
      await resend().execute(input);

      await expect(resend().execute(input)).rejects.toBeInstanceOf(PaymentLinkResentTooSoonError);
      expect(sendPaymentOpen).toHaveBeenCalledTimes(1);
    });

    it("refuses an application that is not approved at the payment stage", async () => {
      await applications.save(application({ stage: "installation" }));
      await expect(resend().execute(input)).rejects.toBeInstanceOf(PaymentLinkNotResendableError);

      await applications.save(application({ status: "under_review" }));
      await expect(resend().execute(input)).rejects.toBeInstanceOf(PaymentLinkNotResendableError);
      expect(sendPaymentOpen).not.toHaveBeenCalled();
    });

    it("answers not found for an unknown application", async () => {
      await expect(resend().execute({ ...input, applicationId: "nope" })).rejects.toMatchObject({
        name: "ApplicationNotFoundError",
      });
    });
  });
});
