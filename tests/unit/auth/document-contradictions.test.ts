import { describe, expect, it } from "vitest";
import {
  CONTRADICTION_CONFIDENCE_FLOOR,
  findDocumentContradictions,
} from "@auth/onboarding/domain/document-contradictions";
import type { DocumentExtraction } from "@auth/onboarding/domain/ports/document-extraction.port";
import type { StoredOnboardingApplication } from "@auth/onboarding/domain/onboarding-application.repository";

function application(
  overrides: Partial<StoredOnboardingApplication> = {},
): StoredOnboardingApplication {
  const now = new Date();
  return {
    id: "app-1",
    reference: "APP-2026-ABCD",
    tokenHash: "hash",
    applicantType: "enterprise",
    organizationName: "Arne Logistics Ltd",
    businessEmail: "jane@arne.com",
    organizationPhone: "+2348000000000",
    contactFullName: "Jane Doe",
    contactRole: null,
    streetAddress: "Mazi Fedelis Street",
    city: "Abuja",
    state: "FCT",
    rcNumber: "RC1234567",
    taxIdentificationNumber: null,
    identificationType: null,
    identificationNumber: null,
    m2mPlanCode: null,
    stage: "application",
    emailVerifiedAt: now,
    phoneVerifiedAt: now,
    status: "submitted",
    submittedAt: now,
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

function extraction(
  field: string,
  value: string | null,
  confidence: number,
): DocumentExtraction {
  return {
    documentId: "doc-1",
    documentType: "cac_document",
    fields: [
      {
        field: field as DocumentExtraction["fields"][number]["field"],
        value,
        confidence,
      },
    ],
    engine: "paddleocr",
    engineVersion: "2.9.0",
    extractedAt: new Date(),
  };
}

describe("Document contradictions", () => {
  it("reports an identifier the document reads differently", () => {
    const found = findDocumentContradictions(application(), [
      extraction("rc_number", "RC7654321", 0.9),
    ]);

    expect(found).toEqual([
      {
        documentId: "doc-1",
        field: "rc_number",
        claimed: "RC1234567",
        read: "RC7654321",
      },
    ]);
  });

  it("accepts a formatting difference as agreement", () => {
    for (const read of ["RC 1234567", "rc-1234567", "RC1234567"]) {
      expect(
        findDocumentContradictions(application(), [
          extraction("rc_number", read, 0.9),
        ]),
      ).toEqual([]);
    }
  });

  it("ignores a read the two passes disagreed on", () => {
    // A zero-confidence field is exactly what the second pass is for.
    expect(
      findDocumentContradictions(application(), [
        extraction("rc_number", "RC7654321", 0),
      ]),
    ).toEqual([]);
  });

  it("ignores a read below the confidence floor", () => {
    expect(
      findDocumentContradictions(application(), [
        extraction("rc_number", "RC7654321", CONTRADICTION_CONFIDENCE_FLOOR - 0.01),
      ]),
    ).toEqual([]);
  });

  it("says nothing about a field the application never claimed", () => {
    expect(
      findDocumentContradictions(application({ rcNumber: null }), [
        extraction("rc_number", "RC7654321", 0.95),
      ]),
    ).toEqual([]);
  });

  it("says nothing when the document was unreadable", () => {
    expect(
      findDocumentContradictions(application(), [
        extraction("rc_number", null, 0),
      ]),
    ).toEqual([]);
  });

  it("does not compare names, which vary honestly", () => {
    const found = findDocumentContradictions(application(), [
      extraction("organization_name", "ARNE LOGISTICS LIMITED", 0.95),
    ]);

    expect(found).toEqual([]);
  });
});
