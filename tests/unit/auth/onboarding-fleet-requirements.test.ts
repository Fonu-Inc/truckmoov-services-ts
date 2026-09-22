import { describe, expect, it } from "vitest";
import {
  DRAFT_LIFETIME_MS,
  isDraftExpired,
  missingDocumentTypes,
  requestedDeviceCount,
  vehiclesMissingDocuments,
} from "@auth/onboarding/domain/onboarding-application.support";
import type {
  StoredOnboardingApplication,
  StoredOnboardingApplicationDocument,
  StoredOnboardingApplicationVehicle,
  StoredOnboardingDeviceRequest,
} from "@auth/onboarding/domain/onboarding-application.repository";
import {
  buildOnboardingVehicleCsvTemplate,
  parseOnboardingVehicleCsv,
  VehicleCsvColumnsMissingError,
} from "@auth/onboarding/domain/onboarding-vehicle-csv";

function document(
  documentType: string,
  vehicleId: string | null = null,
): StoredOnboardingApplicationDocument {
  return {
    id: `doc-${documentType}-${vehicleId ?? "app"}`,
    applicationId: "app-1",
    vehicleId,
    tenantId: null,
    documentType: documentType as StoredOnboardingApplicationDocument["documentType"],
    documentName: `${documentType}.pdf`,
    fileKey: `key/${documentType}`,
    fileSize: 1,
    mimeType: "application/pdf",
    status: "pending",
    rejectionReason: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function vehicle(
  id: string,
  registrationNumber: string,
): StoredOnboardingApplicationVehicle {
  return {
    id,
    applicationId: "app-1",
    registrationNumber,
    vehicleType: "truck",
    make: "Toyota",
    model: "Hilux",
    year: null,
    engineNumber: null,
    chassisNumber: null,
    color: null,
    engineCapacity: null,
    odometerReading: null,
    purchaseType: null,
    purchaseTypeOther: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function deviceRequest(quantity: number): StoredOnboardingDeviceRequest {
  return {
    id: `req-${quantity}`,
    applicationId: "app-1",
    quantity,
    useCase: "Tracking the distribution fleet",
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("Required documents by applicant type", () => {
  it("asks an enterprise applicant for eight documents", () => {
    expect(missingDocumentTypes("fleet_provider", [])).toHaveLength(8);
  });

  it("asks an owner operator for two", () => {
    expect(missingDocumentTypes("owner_operator", [])).toEqual([
      "proof_of_ownership",
      "vehicle_license",
    ]);
  });

  it("does not ask either type for the signed indemnity form", () => {
    for (const applicantType of ["fleet_provider", "owner_operator"] as const) {
      expect(missingDocumentTypes(applicantType, [])).not.toContain(
        "signed_indemnity_form",
      );
    }
  });
});

describe("Per-vehicle documents", () => {
  it("names each vehicle still missing its licence", () => {
    const vehicles = [vehicle("v1", "LAG-123-ABC"), vehicle("v2", "LAG-456-DEF")];
    const documents = [document("vehicle_license", "v1")];

    expect(
      vehiclesMissingDocuments("owner_operator", vehicles, documents),
    ).toEqual([
      {
        vehicleId: "v2",
        registrationNumber: "LAG-456-DEF",
        documentType: "vehicle_license",
      },
    ]);
  });

  it("does not accept an application-wide licence for a vehicle", () => {
    const vehicles = [vehicle("v1", "LAG-123-ABC")];

    expect(
      vehiclesMissingDocuments("owner_operator", vehicles, [
        document("vehicle_license"),
      ]),
    ).toHaveLength(1);
  });
});

describe("Requested device count", () => {
  it("totals every request on the application", () => {
    expect(requestedDeviceCount([deviceRequest(2), deviceRequest(3)])).toBe(5);
  });

  it("is zero when nothing was requested", () => {
    expect(requestedDeviceCount([])).toBe(0);
  });
});

describe("Vehicle CSV", () => {
  it("parses the template it hands out", () => {
    const parsed = parseOnboardingVehicleCsv(
      buildOnboardingVehicleCsvTemplate(),
    );

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].registrationNumber).toBe("LAG-123-ABC");
    expect(parsed.rows[0].vehicleType).toBe("truck");
  });

  it("keeps the good rows and reports the broken ones", () => {
    const parsed = parseOnboardingVehicleCsv(
      [
        "registration_number,vehicle_type,make,model",
        "LAG-111-AAA,truck,Toyota,Hilux",
        "LAG-222-BBB,submarine,Toyota,Hilux",
      ].join("\n"),
    );

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0].line).toBe(3);
  });

  it("refuses a file missing a required column", () => {
    expect(() =>
      parseOnboardingVehicleCsv("registration_number,make\nLAG-111-AAA,Toyota"),
    ).toThrow(VehicleCsvColumnsMissingError);
  });
});

function application(
  status: StoredOnboardingApplication["status"],
  updatedAt: Date,
): StoredOnboardingApplication {
  return {
    id: "app-1",
    reference: "APP-2026-ABCD",
    tokenHash: "hash",
    applicantType: "fleet_provider",
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
    emailVerifiedAt: null,
    phoneVerifiedAt: null,
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
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt,
  };
}

describe("Draft lifetime", () => {
  const now = new Date("2026-09-22T12:00:00Z");

  it("expires a draft left untouched past the lifetime", () => {
    const stale = new Date(now.getTime() - DRAFT_LIFETIME_MS - 1000);
    expect(isDraftExpired(application("draft", stale), now)).toBe(true);
  });

  it("keeps a draft alive while it is being worked on", () => {
    const recent = new Date(now.getTime() - DRAFT_LIFETIME_MS + 1000);
    expect(isDraftExpired(application("draft", recent), now)).toBe(false);
  });

  it("never expires an application that has left the applicant's hands", () => {
    const stale = new Date(now.getTime() - DRAFT_LIFETIME_MS * 4);
    for (const status of ["submitted", "under_review", "approved"] as const) {
      expect(isDraftExpired(application(status, stale), now)).toBe(false);
    }
  });
});
