import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import {
  ONBOARDING_DOCUMENT_TYPES,
  type OnboardingDocumentType,
  type StoredOnboardingApplication,
  type StoredOnboardingApplicationDocument,
} from './onboarding-application.repository';

export const APPLICATION_TOKEN_BYTES = 32;
export const VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;
export const VERIFICATION_MAX_ATTEMPTS = 5;
export const VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;
export const VERIFICATION_MAX_SENDS_PER_HOUR = 5;
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

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

export function missingDocumentTypes(
  documents: StoredOnboardingApplicationDocument[],
): OnboardingDocumentType[] {
  const present = new Set(documents.map((document) => document.documentType));
  return ONBOARDING_DOCUMENT_TYPES.filter((type) => !present.has(type));
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
) {
  return {
    id: application.id,
    reference: application.reference,
    applicantType: application.applicantType,
    status: application.status,
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
    verification: {
      emailVerified: application.emailVerifiedAt !== null,
      phoneVerified: application.phoneVerifiedAt !== null,
    },
    documents: documents.map((document) => ({
      id: document.id,
      documentType: document.documentType,
      documentName: document.documentName,
      fileSize: document.fileSize,
      status: document.status,
      rejectionReason: document.rejectionReason,
      uploadedAt: document.createdAt.toISOString(),
    })),
    missingDocuments: missingDocumentTypes(documents),
    decisionReason: application.decisionReason,
    submittedAt: application.submittedAt?.toISOString() ?? null,
    createdAt: application.createdAt.toISOString(),
  };
}
