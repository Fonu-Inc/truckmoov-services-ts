import { ServiceUnavailableException } from "@nestjs/common";
import { beforeEach, describe, expect, it } from "vitest";
import type { ObjectStorageService } from "@shared/object-storage";
import { InMemoryIdentityClaimRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-identity-claim.repository";
import { InMemoryOnboardingApplicationRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-onboarding-application.repository";
import { GetOnboardingApplicationUseCase } from "@auth/onboarding/application/use-cases/get-onboarding-application.use-case";
import { UploadOnboardingApplicationDocumentUseCase } from "@auth/onboarding/application/use-cases/upload-onboarding-application-document.use-case";
import { DeleteOnboardingApplicationDocumentUseCase } from "@auth/onboarding/application/use-cases/delete-onboarding-application-document.use-case";
import {
  ApplicationNotFoundError,
  hashApplicationToken,
} from "@auth/onboarding/domain/onboarding-application.support";
import { OnboardingValidationError } from "@auth/onboarding/domain/onboarding-application.validation";
import { InvalidDocumentFileError } from "@auth/onboarding/domain/onboarding-document-file";
import type {
  OnboardingApplicantType,
  StoredOnboardingApplication,
} from "@auth/onboarding/domain/onboarding-application.repository";

const TOKEN = "applicant-token";
const PDF = Buffer.concat([Buffer.from("%PDF-1.7"), Buffer.alloc(64)]);

function application(
  applicantType: OnboardingApplicantType,
): StoredOnboardingApplication {
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

function pdf(name: string) {
  return {
    originalname: name,
    mimetype: "application/pdf",
    size: PDF.byteLength,
    buffer: PDF,
  };
}

describe("Onboarding document upload", () => {
  let applications: InMemoryOnboardingApplicationRepository;
  let upload: UploadOnboardingApplicationDocumentUseCase;
  let remove: DeleteOnboardingApplicationDocumentUseCase;
  let putFails = false;

  beforeEach(() => {
    putFails = false;
    applications = new InMemoryOnboardingApplicationRepository();
    const storage = {
      putObject: async ({ key }: { key: string }) => {
        if (putFails) throw new Error("storage down");
        return key;
      },
      deleteObject: async () => undefined,
    } as unknown as ObjectStorageService;
    const claims = new InMemoryIdentityClaimRepository();
    const getApplication = new GetOnboardingApplicationUseCase(applications);
    let ids = 0;
    upload = new UploadOnboardingApplicationDocumentUseCase(
      applications,
      storage,
      { generate: () => `doc-${++ids}` },
      getApplication,
      claims,
    );
    remove = new DeleteOnboardingApplicationDocumentUseCase(
      applications,
      storage,
      getApplication,
      claims,
    );
  });

  const target = { applicationId: "app-1", applicationToken: TOKEN };

  it("refuses a document the applicant type does not need", async () => {
    await applications.save(application("owner_operator"));

    await expect(
      upload.execute({
        ...target,
        documentType: "cac_document",
        file: pdf("cac.pdf"),
      }),
    ).rejects.toBeInstanceOf(OnboardingValidationError);
  });

  it("accepts a document the applicant type needs", async () => {
    await applications.save(application("owner_operator"));

    const result = await upload.execute({
      ...target,
      documentType: "proof_of_ownership",
      file: pdf("ownership.pdf"),
    });

    expect(result.data.documents.map((doc) => doc.documentType)).toEqual([
      "proof_of_ownership",
    ]);
  });

  it("replaces the document of the same type and touches the application", async () => {
    const draft = application("owner_operator");
    const before = new Date(Date.now() - 60_000);
    draft.updatedAt = before;
    await applications.save(draft);
    const input = {
      ...target,
      documentType: "proof_of_ownership",
      file: pdf("ownership.pdf"),
    };

    await upload.execute(input);
    const result = await upload.execute(input);

    expect(result.data.documents).toHaveLength(1);
    expect(result.data.documents[0].id).toBe("doc-1");
    expect(
      (await applications.findById("app-1"))?.updatedAt.getTime(),
    ).toBeGreaterThan(before.getTime());
  });

  it("stores no row when the file cannot be stored", async () => {
    await applications.save(application("owner_operator"));
    putFails = true;

    await expect(
      upload.execute({
        ...target,
        documentType: "proof_of_ownership",
        file: pdf("ownership.pdf"),
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(await applications.findDocumentsByApplicationId("app-1")).toEqual([]);
  });

  it("refuses an upload of the generated indemnity form", async () => {
    await applications.save(application("enterprise"));

    await expect(
      upload.execute({
        ...target,
        documentType: "signed_indemnity_form",
        file: pdf("indemnity.pdf"),
      }),
    ).rejects.toBeInstanceOf(InvalidDocumentFileError);
  });

  it("refuses to delete the generated indemnity form", async () => {
    await applications.save(application("enterprise"));
    await applications.saveDocument({
      id: "doc-indemnity",
      applicationId: "app-1",
      vehicleId: null,
      tenantId: null,
      documentType: "signed_indemnity_form",
      documentName: "indemnity-agreement-v1.pdf",
      fileKey: "key/indemnity",
      fileHash: "hash",
      fileSize: 1,
      mimeType: "application/pdf",
      status: "pending",
      rejectionReason: null,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      remove.execute({ ...target, documentId: "doc-indemnity" }),
    ).rejects.toBeInstanceOf(ApplicationNotFoundError);
    expect(await applications.findDocumentById("doc-indemnity")).not.toBeNull();
  });
});
