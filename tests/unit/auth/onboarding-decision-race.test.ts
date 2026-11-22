import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryOnboardingApplicationRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-onboarding-application.repository";
import {
  ApproveOnboardingApplicationUseCase,
  RejectOnboardingApplicationUseCase,
} from "@auth/onboarding/application/use-cases/decide-onboarding-application.use-cases";
import { ApplicationNotUnderReviewError } from "@auth/onboarding/application/use-cases/review-onboarding-application.use-cases";
import { touchApplication } from "@auth/onboarding/application/use-cases/support/touch-application";
import type { StoredOnboardingApplication } from "@auth/onboarding/domain/onboarding-application.repository";

const NOW = new Date("2026-10-02T12:00:00Z");

function submitted(): StoredOnboardingApplication {
  return {
    id: "app-1",
    reference: "APP-2026-AAAA",
    tokenHash: "hash",
    applicantType: "owner_operator",
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
    status: "submitted",
    stage: "application",
    submittedAt: NOW,
    reviewedBy: null,
    reviewedAt: null,
    decisionReason: null,
    tenantId: null,
    setupLinkStatus: null,
    setupLinkSentAt: null,
    setupLinkError: null,
    setupLinkAttempts: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe("Deciding an onboarding application", () => {
  let applications: InMemoryOnboardingApplicationRepository;
  let tenantsCreated: number;
  let paymentNotices: number;
  let ids: number;

  beforeEach(async () => {
    applications = new InMemoryOnboardingApplicationRepository();
    tenantsCreated = 0;
    paymentNotices = 0;
    ids = 0;
    await applications.save(submitted());
  });

  const approve = () =>
    new ApproveOnboardingApplicationUseCase(
      applications,
      {} as never,
      { findByEmail: async () => null } as never,
      {} as never,
      { save: async () => undefined } as never,
      { save: async () => void tenantsCreated++ } as never,
      {} as never,
      { generate: () => `id-${++ids}` },
      { availability: async () => ({ tracked: false, availableQuantity: 0 }) } as never,
      { findByTier: async () => null } as never,
      { startIfAbsent: async () => undefined } as never,
      { resolve: async () => null } as never,
      { paymentOpened: async () => void paymentNotices++ } as never,
      {} as never,
    );

  const reject = () =>
    new RejectOnboardingApplicationUseCase(
      applications,
      {} as never,
      {} as never,
      { sendRejected: async () => undefined } as never,
    );

  it("refuses the second of two concurrent approvals", async () => {
    const results = await Promise.allSettled([
      approve().executeAsSystem("app-1"),
      approve().executeAsSystem("app-1"),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const refused = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(refused.reason).toBeInstanceOf(ApplicationNotUnderReviewError);
    expect(tenantsCreated).toBe(1);
  });

  it("refuses a rejection racing an approval", async () => {
    const results = await Promise.allSettled([
      approve().executeAsSystem("app-1"),
      reject().executeAsSystem("app-1", "registry mismatch"),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const { status } = (await applications.findById("app-1"))!;
    expect(tenantsCreated).toBe(status === "approved" ? 1 : 0);
  });

  it("puts the application back when provisioning the tenant fails", async () => {
    const failing = new ApproveOnboardingApplicationUseCase(
      applications,
      {} as never,
      { findByEmail: async () => null } as never,
      {} as never,
      { save: async () => { throw new Error("db down"); } } as never,
      {} as never,
      {} as never,
      { generate: () => `id-${++ids}` },
      { availability: async () => ({ tracked: false, availableQuantity: 0 }) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(failing.executeAsSystem("app-1")).rejects.toThrow("db down");
    expect((await applications.findById("app-1"))!.status).toBe("submitted");
  });

  it("approval moves straight to payment when stock allows", async () => {
    const res = await approve().executeAsSystem("app-1");
    expect(res.data.stage).toBe("payment");
    expect(paymentNotices).toBe(1);
  });
});

describe("Touching an application", () => {
  it("does not revert a status changed since it was read", async () => {
    const applications = new InMemoryOnboardingApplicationRepository();
    await applications.save(submitted());
    const stale = { ...(await applications.findById("app-1"))! };
    await applications.save({ ...stale, status: "approved", stage: "payment" });

    await touchApplication(applications, stale);

    const current = await applications.findById("app-1");
    expect(current!.status).toBe("approved");
    expect(current!.stage).toBe("payment");
  });
});
