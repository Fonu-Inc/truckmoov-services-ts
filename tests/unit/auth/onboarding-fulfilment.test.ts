import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryOnboardingApplicationRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-onboarding-application.repository";
import { InMemoryPickupLocationRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-pickup-location.repository";
import { GetOnboardingApplicationUseCase } from "@auth/onboarding/application/use-cases/get-onboarding-application.use-case";
import {
  ListPickupLocationsUseCase,
  SetApplicationFulfilmentUseCase,
} from "@auth/onboarding/application/use-cases/application-fulfilment.use-cases";
import { hashApplicationToken } from "@auth/onboarding/domain/onboarding-application.support";
import { OnboardingValidationError } from "@auth/onboarding/domain/onboarding-application.validation";
import type {
  OnboardingApplicantType,
  StoredOnboardingApplication,
} from "@auth/onboarding/domain/onboarding-application.repository";

const TOKEN = "applicant-token";

function application(applicantType: OnboardingApplicantType): StoredOnboardingApplication {
  const now = new Date();
  return {
    id: "app-1",
    reference: "APP-2026-AAAA",
    tokenHash: hashApplicationToken(TOKEN),
    applicantType,
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
    m2mPlanCode: null,
    billingEmail: null,
    billingEmailVerifiedAt: null,
    emailVerifiedAt: null,
    phoneVerifiedAt: null,
    status: "draft",
    stage: "application",
    submittedAt: null,
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

describe("Device fulfilment on an application", () => {
  let applications: InMemoryOnboardingApplicationRepository;
  let setFulfilment: SetApplicationFulfilmentUseCase;
  const target = { applicationId: "app-1", applicationToken: TOKEN };

  beforeEach(() => {
    applications = new InMemoryOnboardingApplicationRepository();
    setFulfilment = new SetApplicationFulfilmentUseCase(
      applications,
      new GetOnboardingApplicationUseCase(applications),
      new InMemoryPickupLocationRepository(),
    );
  });

  it("lists the demo pickup points", async () => {
    const result = await new ListPickupLocationsUseCase(new InMemoryPickupLocationRepository()).execute();
    expect(result.data.every((location) => location.isDemo)).toBe(true);
  });

  it("saves a pickup point and returns it on the application", async () => {
    await applications.save(application("owner_operator"));

    const result = await setFulfilment.execute({ ...target, method: "pickup", pickupLocationId: "demo-1" });

    expect(result.data.fulfilment).toEqual({ method: "pickup", pickupLocationId: "demo-1" });
  });

  it("refuses a pickup point that is not on the list", async () => {
    await applications.save(application("enterprise"));

    await expect(
      setFulfilment.execute({ ...target, method: "pickup", pickupLocationId: "nowhere" }),
    ).rejects.toBeInstanceOf(OnboardingValidationError);
  });

  it.each(["enterprise", "owner_operator"] as const)("refuses delivery for an %s, even with a full address", async (type) => {
    await applications.save(application(type));

    await expect(
      setFulfilment.execute({
        ...target,
        method: "delivery",
        deliveryStreet: "12 Marina Road",
        deliveryCity: "Lagos Island",
        deliveryState: "Lagos",
      }),
    ).rejects.toThrow("delivery is not offered");
  });
});
