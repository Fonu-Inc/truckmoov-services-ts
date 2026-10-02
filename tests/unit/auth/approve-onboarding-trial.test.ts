import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryOnboardingApplicationRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-onboarding-application.repository";
import { ApproveOnboardingApplicationUseCase } from "@auth/onboarding/application/use-cases/decide-onboarding-application.use-cases";
import type { StoredOnboardingApplication } from "@auth/onboarding/domain/onboarding-application.repository";
import { InMemoryTenantTrialRepository } from "../../../apps/auth/src/in-memory-tenant-trial.repository";

const NOW = new Date("2026-10-02T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

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

describe("Approving a self-serve application starts the trial", () => {
  let applications: InMemoryOnboardingApplicationRepository;
  let trials: InMemoryTenantTrialRepository;
  let trialDays: number | null;
  let ids: number;

  beforeEach(async () => {
    applications = new InMemoryOnboardingApplicationRepository();
    trials = new InMemoryTenantTrialRepository();
    trialDays = 14;
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
      { save: async () => undefined } as never,
      {} as never,
      { generate: () => `id-${++ids}` },
      { availability: async () => ({ tracked: false, availableQuantity: 0 }) } as never,
      { findByTier: async () => ({ trialDays }) } as never,
      trials,
    );

  it("records a trial for the new tenant from the plan's trial days", async () => {
    const res = await approve().executeAsSystem("app-1");

    const trial = await trials.findByTenant(res.data.tenantId);
    expect(trial).not.toBeNull();
    expect(trial!.trialEndsAt.getTime() - trial!.startedAt.getTime()).toBe(14 * DAY_MS);
  });

  it("records no trial when the plan has none", async () => {
    trialDays = 0;

    const res = await approve().executeAsSystem("app-1");

    expect(await trials.findByTenant(res.data.tenantId)).toBeNull();
  });
});
