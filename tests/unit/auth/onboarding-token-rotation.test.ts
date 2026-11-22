import { describe, expect, it } from "vitest";
import { GetOnboardingApplicationUseCase } from "@auth/onboarding/application/use-cases/get-onboarding-application.use-case";
import { ApplicationNotFoundError, hashApplicationToken } from "@auth/onboarding/domain/onboarding-application.support";
import type { StoredOnboardingApplication } from "@auth/onboarding/domain/onboarding-application.repository";
import { InMemoryOnboardingApplicationRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-onboarding-application.repository";

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

describe("payment email token rotation", () => {
  it("keeps the browser's token working next to the emailed one, but not the one before", async () => {
    const applications = new InMemoryOnboardingApplicationRepository();
    await applications.save({ ...submitted(), tokenHash: hashApplicationToken("browser") });
    const resolve = (token: string) => new GetOnboardingApplicationUseCase(applications).resolve("app-1", token);

    await applications.completePaymentNotice("app-1", hashApplicationToken("emailed"), NOW);
    expect((await resolve("browser")).id).toBe("app-1");
    expect((await resolve("emailed")).id).toBe("app-1");

    await applications.completePaymentNotice("app-1", hashApplicationToken("resent"), NOW);
    await expect(resolve("browser")).rejects.toBeInstanceOf(ApplicationNotFoundError);
  });
});
