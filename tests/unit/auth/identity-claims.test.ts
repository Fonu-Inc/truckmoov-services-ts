import { beforeEach, describe, expect, it } from "vitest";
import {
  DuplicateIdentityError,
  enforceIdentityClaims,
} from "@auth/onboarding/application/use-cases/support/enforce-identity-claims";
import { identityClaimsOf } from "@auth/onboarding/domain/identity-claims";
import { InMemoryIdentityClaimRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-identity-claim.repository";
import { InMemoryOnboardingApplicationRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-onboarding-application.repository";
import type {
  OnboardingApplicationStatus,
  StoredOnboardingApplication,
} from "@auth/onboarding/domain/onboarding-application.repository";

function application(
  id: string,
  overrides: Partial<StoredOnboardingApplication> = {},
): StoredOnboardingApplication {
  const now = new Date();
  return {
    id,
    reference: `APP-2026-${id.toUpperCase()}`,
    tokenHash: `hash-${id}`,
    applicantType: "fleet_provider",
    organizationName: "Arne logistics Ltd",
    businessEmail: `${id}@arne.com`,
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
    emailVerifiedAt: null,
    phoneVerifiedAt: null,
    status: "draft",
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
    ...overrides,
  };
}

describe("Identity claims", () => {
  let applications: InMemoryOnboardingApplicationRepository;
  let claims: InMemoryIdentityClaimRepository;

  beforeEach(() => {
    applications = new InMemoryOnboardingApplicationRepository();
    claims = new InMemoryIdentityClaimRepository();
  });

  async function register(
    app: StoredOnboardingApplication,
  ): Promise<void> {
    await applications.save(app);
    await enforceIdentityClaims(claims, applications, app);
  }

  async function documentFor(applicationId: string, fileHash: string) {
    const now = new Date();
    await applications.saveDocument({
      id: `doc-${applicationId}`,
      applicationId,
      vehicleId: null,
      tenantId: null,
      documentType: "cac_document",
      documentName: "cac.pdf",
      fileKey: `key/${applicationId}`,
      fileHash,
      fileSize: 10,
      mimeType: "application/pdf",
      status: "pending",
      rejectionReason: null,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  it("blocks a second application reusing an RC number under another email", async () => {
    await register(application("first", { rcNumber: "RC1234567" }));
    const second = application("second", { rcNumber: "RC1234567" });
    await applications.save(second);

    await expect(
      enforceIdentityClaims(claims, applications, second),
    ).rejects.toBeInstanceOf(DuplicateIdentityError);
  });

  it("blocks a second application reusing an uploaded document", async () => {
    await applications.save(application("first"));
    await documentFor("first", "sha-of-the-cac");
    await enforceIdentityClaims(
      claims,
      applications,
      (await applications.findById("first"))!,
    );

    const second = application("second");
    await applications.save(second);
    await documentFor("second", "sha-of-the-cac");

    await expect(
      enforceIdentityClaims(claims, applications, second),
    ).rejects.toBeInstanceOf(DuplicateIdentityError);
  });

  it("stops blocking once the first application is rejected", async () => {
    await register(application("first", { rcNumber: "RC1234567" }));
    await applications.save(
      application("first", { rcNumber: "RC1234567", status: "rejected" }),
    );

    const second = application("second", { rcNumber: "RC1234567" });
    await applications.save(second);

    await expect(
      enforceIdentityClaims(claims, applications, second),
    ).resolves.toBeUndefined();
  });

  it.each(["submitted", "under_review", "changes_requested", "approved"] as const)(
    "keeps blocking while the first application is %s",
    async (status: OnboardingApplicationStatus) => {
      await register(application("first", { rcNumber: "RC1234567" }));
      await applications.save(
        application("first", { rcNumber: "RC1234567", status }),
      );

      const second = application("second", { rcNumber: "RC1234567" });
      await applications.save(second);

      await expect(
        enforceIdentityClaims(claims, applications, second),
      ).rejects.toBeInstanceOf(DuplicateIdentityError);
    },
  );

  it("releases a claim the applicant corrected away", async () => {
    await register(application("first", { rcNumber: "RC0000001" }));
    // The applicant mistyped, then fixed it. The wrong number must stop
    // blocking whoever actually owns it.
    await register(application("first", { rcNumber: "RC1234567" }));

    const second = application("second", { rcNumber: "RC0000001" });
    await applications.save(second);

    await expect(
      enforceIdentityClaims(claims, applications, second),
    ).resolves.toBeUndefined();
  });

  it("does not treat an application as a duplicate of itself", async () => {
    const app = application("first", { rcNumber: "RC1234567" });
    await register(app);

    await expect(
      enforceIdentityClaims(claims, applications, app),
    ).resolves.toBeUndefined();
  });

  it("collects every identifier the application supplies", () => {
    const app = application("first", {
      rcNumber: "RC1234567",
      taxIdentificationNumber: "12345678",
      identificationNumber: "NIN123456789",
    });

    expect(identityClaimsOf(app, [])).toEqual([
      { claimType: "rc_number", claimValue: "RC1234567" },
      { claimType: "tax_identification_number", claimValue: "12345678" },
      { claimType: "identification_number", claimValue: "NIN123456789" },
    ]);
  });
});
