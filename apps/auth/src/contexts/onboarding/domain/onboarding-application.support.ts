import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import {
  PER_VEHICLE_DOCUMENT_TYPES,
  REQUIRED_DOCUMENTS_BY_APPLICANT_TYPE,
  type OnboardingApplicantType,
  type OnboardingDocumentType,
  type OnboardingVerificationChannel,
  type StoredOnboardingApplication,
  type StoredOnboardingApplicationDocument,
  type StoredOnboardingApplicationVehicle,
  type StoredOnboardingDeviceRequest,
} from './onboarding-application.repository';
import type { StoredOnboardingPayment } from './onboarding-payment.repository';

export const APPLICATION_TOKEN_BYTES = 32;
export const VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;
export const VERIFICATION_MAX_ATTEMPTS = 5;
export const VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;
export const VERIFICATION_MAX_SENDS_PER_HOUR = 5;
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/**
 * How long an unsubmitted application survives without being touched.
 *
 * Measured from the last activity rather than from creation, so an applicant
 * gathering documents over several weeks does not lose the work, while an
 * abandoned draft holding a verified email and a business address does not sit
 * there indefinitely.
 */
export const DRAFT_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export class ApplicationNotFoundError extends Error {
  constructor() {
    super('Application not found');
    this.name = 'ApplicationNotFoundError';
  }
}

export class ApplicationNotEditableError extends Error {
  constructor(status: string) {
    super(`An application in ${status} state cannot be changed`);
    this.name = 'ApplicationNotEditableError';
  }
}

export class BusinessEmailInUseError extends Error {
  constructor() {
    super('An account or application already exists for this email');
    this.name = 'BusinessEmailInUseError';
  }
}

export function generateApplicationToken(): string {
  return randomBytes(APPLICATION_TOKEN_BYTES).toString('base64url');
}

export function hashApplicationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateVerificationCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * Codes are compared by hash so a stored value never reveals the code, and
 * through timingSafeEqual so a wrong code cannot be narrowed digit by digit.
 */
export function verificationCodeMatches(code: string, codeHash: string): boolean {
  const candidate = Buffer.from(hashApplicationToken(code), 'hex');
  const expected = Buffer.from(codeHash, 'hex');
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

export function generateApplicationReference(): string {
  const suffix = randomBytes(4).toString('hex').toUpperCase();
  return `APP-${new Date().getFullYear()}-${suffix}`;
}

export function draftExpiresAt(
  application: StoredOnboardingApplication,
): Date {
  return new Date(application.updatedAt.getTime() + DRAFT_LIFETIME_MS);
}

export function isDraftExpired(
  application: StoredOnboardingApplication,
  now: Date = new Date(),
): boolean {
  if (!isApplicationEditable(application)) return false;
  return draftExpiresAt(application).getTime() <= now.getTime();
}

export function isApplicationEditable(
  application: StoredOnboardingApplication,
): boolean {
  return (
    application.status === 'draft' || application.status === 'changes_requested'
  );
}

export function assertApplicationEditable(
  application: StoredOnboardingApplication,
): void {
  if (!isApplicationEditable(application)) {
    throw new ApplicationNotEditableError(application.status);
  }
}

type LatestPayment = Pick<StoredOnboardingPayment, 'status'> | null;

/**
 * The billing email is set and verified on the Payment step, after approval,
 * so it stays open until the stage moves past payment. A paid payment closes
 * it too: the stage advance is a separate write and can lag behind.
 */
export function isBillingEmailChangeable(
  application: StoredOnboardingApplication,
  latestPayment: LatestPayment,
): boolean {
  if (latestPayment?.status === 'paid') return false;
  return isApplicationEditable(application) || application.stage === 'payment';
}

export function assertBillingEmailChangeable(
  application: StoredOnboardingApplication,
  latestPayment: LatestPayment,
): void {
  if (!isBillingEmailChangeable(application, latestPayment)) {
    throw new ApplicationNotEditableError(application.status);
  }
}

export function assertVerificationChannelOpen(
  application: StoredOnboardingApplication,
  channel: OnboardingVerificationChannel,
  latestPayment: LatestPayment,
): void {
  if (channel === 'billing_email') {
    assertBillingEmailChangeable(application, latestPayment);
    return;
  }
  assertApplicationEditable(application);
}

export function requiredDocumentTypes(
  applicantType: OnboardingApplicantType,
): readonly OnboardingDocumentType[] {
  return REQUIRED_DOCUMENTS_BY_APPLICANT_TYPE[applicantType];
}

export function isPerVehicleDocument(type: OnboardingDocumentType): boolean {
  return PER_VEHICLE_DOCUMENT_TYPES.includes(type);
}

export function missingDocumentTypes(
  applicantType: OnboardingApplicantType,
  documents: StoredOnboardingApplicationDocument[],
): OnboardingDocumentType[] {
  const present = new Set(documents.map((document) => document.documentType));
  return requiredDocumentTypes(applicantType).filter(
    (type) => !present.has(type),
  );
}

/**
 * Vehicles still waiting on a per-vehicle document.
 *
 * A vehicle with no licence on file is as incomplete as a missing
 * application-wide document, and the applicant cannot tell which vehicle is
 * short without being told which one.
 */
export function vehiclesMissingDocuments(
  applicantType: OnboardingApplicantType,
  vehicles: StoredOnboardingApplicationVehicle[],
  documents: StoredOnboardingApplicationDocument[],
): { vehicleId: string; registrationNumber: string; documentType: OnboardingDocumentType }[] {
  const perVehicleRequired = requiredDocumentTypes(applicantType).filter(
    isPerVehicleDocument,
  );
  if (perVehicleRequired.length === 0) return [];

  const held = new Set(
    documents
      .filter((document) => document.vehicleId !== null)
      .map((document) => `${document.vehicleId}:${document.documentType}`),
  );

  return vehicles.flatMap((vehicle) =>
    perVehicleRequired
      .filter((type) => !held.has(`${vehicle.id}:${type}`))
      .map((documentType) => ({
        vehicleId: vehicle.id,
        registrationNumber: vehicle.registrationNumber,
        documentType,
      })),
  );
}

/**
 * Devices cannot outnumber vehicles: every device is fitted to one vehicle, so
 * a request beyond the fleet submitted has nowhere to go at installation.
 */
export function requestedDeviceCount(
  requests: StoredOnboardingDeviceRequest[],
): number {
  return requests.reduce((total, request) => total + request.quantity, 0);
}

export function applicationDocumentKey(
  applicationId: string,
  documentType: OnboardingDocumentType,
  extension: string,
): string {
  return `auth/onboarding-applications/${applicationId}/${documentType}-${randomBytes(8).toString('hex')}${extension}`;
}

export function toApplicationView(
  application: StoredOnboardingApplication,
  documents: StoredOnboardingApplicationDocument[],
  vehicles: StoredOnboardingApplicationVehicle[] = [],
  deviceRequests: StoredOnboardingDeviceRequest[] = [],
) {
  return {
    id: application.id,
    reference: application.reference,
    applicantType: application.applicantType,
    status: application.status,
    stage: application.stage,
    organization: {
      organizationName: application.organizationName,
      businessEmail: application.businessEmail,
      organizationPhone: application.organizationPhone,
      streetAddress: application.streetAddress,
      city: application.city,
      state: application.state,
    },
    contact: {
      fullName: application.contactFullName,
      role: application.contactRole,
    },
    m2mPlanCode: application.m2mPlanCode,
    registry: {
      rcNumber: application.rcNumber,
      taxIdentificationNumber: application.taxIdentificationNumber,
      identificationType: application.identificationType,
      identificationNumber: application.identificationNumber,
    },
    vehicles: vehicles.map((vehicle) => ({
      id: vehicle.id,
      registrationNumber: vehicle.registrationNumber,
      vehicleType: vehicle.vehicleType,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      engineNumber: vehicle.engineNumber,
      chassisNumber: vehicle.chassisNumber,
      color: vehicle.color,
      engineCapacity: vehicle.engineCapacity,
      odometerReading: vehicle.odometerReading,
      purchaseType: vehicle.purchaseType,
      purchaseTypeOther: vehicle.purchaseTypeOther,
    })),
    deviceRequests: deviceRequests.map((request) => ({
      id: request.id,
      quantity: request.quantity,
      useCase: request.useCase,
      notes: request.notes,
    })),
    requestedDevices: requestedDeviceCount(deviceRequests),
    verification: {
      emailVerified: application.emailVerifiedAt !== null,
      phoneVerified: application.phoneVerifiedAt !== null,
    },
    documents: documents.map((document) => ({
      id: document.id,
      vehicleId: document.vehicleId,
      documentType: document.documentType,
      documentName: document.documentName,
      fileSize: document.fileSize,
      status: document.status,
      rejectionReason: document.rejectionReason,
      uploadedAt: document.createdAt.toISOString(),
    })),
    missingDocuments: missingDocumentTypes(application.applicantType, documents),
    vehiclesMissingDocuments: vehiclesMissingDocuments(
      application.applicantType,
      vehicles,
      documents,
    ),
    decisionReason: application.decisionReason,
    submittedAt: application.submittedAt?.toISOString() ?? null,
    createdAt: application.createdAt.toISOString(),
  };
}
