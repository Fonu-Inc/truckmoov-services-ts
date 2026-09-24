import { beforeEach, describe, expect, it, vi } from "vitest";
import { AbandonedApplicationSweepService } from "@auth/onboarding/infrastructure/retention/abandoned-application-sweep.service";
import { InMemoryIdentityClaimRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-identity-claim.repository";
import { InMemoryIndemnityAgreementRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-indemnity-agreement.repository";
import { InMemoryOnboardingApplicationRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-onboarding-application.repository";
import { InMemoryInstallationOrderRepository } from "@auth/installation";
import { InMemoryOnboardingPaymentRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-onboarding-payment.repository";
import { InMemoryVerificationResultRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-verification-result.repository";
import type { StoredOnboardingApplication } from "@auth/onboarding/domain/onboarding-application.repository";

const NOW = new Date("2026-09-22T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = 90;

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * DAY_MS);
}

function application(
  id: string,
  status: StoredOnboardingApplication["status"],
  updatedAt: Date,
): StoredOnboardingApplication {
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
    emailVerifiedAt: updatedAt,
    phoneVerifiedAt: updatedAt,
    status,
    submittedAt: null,
    reviewedBy: null,
    reviewedAt: null,
    decisionReason: null,
    tenantId: null,
    setupLinkStatus: null,
    setupLinkSentAt: null,
    setupLinkError: null,
    setupLinkAttempts: 0,
    createdAt: updatedAt,
    updatedAt,
  };
}

describe("Abandoned application sweep", () => {
  let applications: InMemoryOnboardingApplicationRepository;
  let agreements: InMemoryIndemnityAgreementRepository;
  let identityClaims: InMemoryIdentityClaimRepository;
  let deleted: string[];
  let storage: { deleteObject: ReturnType<typeof vi.fn> };
  let installationOrders: InMemoryInstallationOrderRepository;
  let sweep: AbandonedApplicationSweepService;

  beforeEach(() => {
    applications = new InMemoryOnboardingApplicationRepository();
    agreements = new InMemoryIndemnityAgreementRepository();
    identityClaims = new InMemoryIdentityClaimRepository();
    deleted = [];
    storage = {
      deleteObject: vi.fn(async (key: string) => {
        deleted.push(key);
      }),
    };

    installationOrders = new InMemoryInstallationOrderRepository();
    const config = {
      persistence: { backend: "mikro-orm" },
      auth: { onboardingRetentionDays: RETENTION_DAYS },
    };

    sweep = new AbandonedApplicationSweepService(
      config as never,
      applications,
      agreements,
      identityClaims,
      new InMemoryVerificationResultRepository(),
      new InMemoryOnboardingPaymentRepository(),
      installationOrders,
      storage as never,
    );
  });

  async function withDocument(id: string, updatedAt: Date) {
    await applications.save(application(id, "draft", updatedAt));
    await applications.saveDocument({
      id: `doc-${id}`,
      applicationId: id,
      vehicleId: null,
      tenantId: null,
      documentType: "cac_document",
      documentName: "cac.pdf",
      fileKey: `key/${id}/cac.pdf`,
      fileHash: `hash-${id}`,
      fileSize: 10,
      mimeType: "application/pdf",
      status: "pending",
      rejectionReason: null,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: updatedAt,
      updatedAt,
    });
  }

  it("erases a draft nobody came back to, and its files", async () => {
    await withDocument("old", daysAgo(RETENTION_DAYS + 1));

    const result = await sweep.run(NOW);

    expect(result.erased).toBe(1);
    expect(deleted).toEqual(["key/old/cac.pdf"]);
    expect(await applications.findById("old")).toBeNull();
    expect(await applications.findDocumentsByApplicationId("old")).toEqual([]);
  });

  it("leaves an application still inside the retention window alone", async () => {
    await withDocument("recent", daysAgo(RETENTION_DAYS - 1));

    expect((await sweep.run(NOW)).erased).toBe(0);
    expect(await applications.findById("recent")).not.toBeNull();
    expect(deleted).toEqual([]);
  });

  it("never erases an application that has left the applicant's hands", async () => {
    const stale = daysAgo(RETENTION_DAYS * 4);
    for (const status of ["submitted", "under_review", "approved", "rejected"] as const) {
      await applications.save(application(status, status, stale));
    }

    expect((await sweep.run(NOW)).erased).toBe(0);
    for (const status of ["submitted", "under_review", "approved", "rejected"] as const) {
      expect(await applications.findById(status)).not.toBeNull();
    }
  });

  it("keeps the rows when a file cannot be deleted", async () => {
    await withDocument("stuck", daysAgo(RETENTION_DAYS + 1));
    storage.deleteObject.mockRejectedValueOnce(new Error("storage down"));

    expect((await sweep.run(NOW)).erased).toBe(0);
    // The row is what lets the next sweep find the file again.
    expect(await applications.findById("stuck")).not.toBeNull();
  });

  it("erases the indemnity signature with the application", async () => {
    const stale = daysAgo(RETENTION_DAYS + 1);
    await withDocument("signed", stale);
    await agreements.saveSignature({
      id: "sig-1",
      applicationId: "signed",
      templateVersion: "v1",
      templateHash: "a".repeat(64),
      signerName: "Jane Doe",
      method: "drawn",
      fileKey: "key/signed/signature.png",
      mimeType: "image/png",
      ipAddress: null,
      userAgent: null,
      signedAt: stale,
    });

    await sweep.run(NOW);

    expect(deleted).toContain("key/signed/signature.png");
    expect(await agreements.findSignatureByApplicationId("signed")).toBeNull();
  });

  it("erases the installation's checklist ticks, evidence rows and evidence files", async () => {
    const stale = daysAgo(RETENTION_DAYS + 1);
    await withDocument("fitted", stale);
    await installationOrders.save({
      id: "order-1", orderNumber: "FL-1000", applicationId: "fitted", tenantId: "tenant-1", scheduledDate: stale,
      timeSlot: "morning", addressLine: "x", city: "Abuja", state: "FCT", siteContactName: "Jane", siteContactPhone: "+234",
      notes: null, installerNotes: null, installerId: null, status: "unassigned", preExceptionStatus: null, assignedAt: null,
      acceptedAt: null, startedAt: null, issueReportedAt: null, completedAt: null, cancelledAt: null, createdAt: stale, updatedAt: stale,
    });
    await installationOrders.saveTick({ orderId: "order-1", itemKey: "install_device", checkedAt: stale, checkedBy: "ada" });
    const fileKey = "tenant-1/installations/order-1/evidence/device_installation/ev-1-unit.png";
    await installationOrders.saveEvidence({
      id: "ev-1", orderId: "order-1", category: "device_installation", fileKey, fileHash: "h", fileSize: 1,
      mimeType: "image/png", uploadedBy: "ada", createdAt: stale,
    });

    await sweep.run(NOW);

    expect(deleted).toContain(fileKey);
    expect(await installationOrders.findById("order-1")).toBeNull();
    expect(await installationOrders.findTicks("order-1")).toEqual([]);
    expect(await installationOrders.findEvidence("order-1")).toEqual([]);
  });
});
