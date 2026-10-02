export const ONBOARDING_APPLICANT_TYPES = [
  'enterprise',
  'owner_operator',
] as const;
export type OnboardingApplicantType =
  (typeof ONBOARDING_APPLICANT_TYPES)[number];

export const ONBOARDING_DOCUMENT_TYPES = [
  'customer_request_letter',
  'cac_document',
  'tax_certificate_or_tin',
  'signature_card',
  'utility_bill',
  'identification_card',
  'proof_of_ownership',
  'vehicle_license',
  // Produced by signing the indemnity form, never uploaded, so it is a
  // document type without being a required upload for either applicant type.
  'signed_indemnity_form',
] as const;
export type OnboardingDocumentType =
  (typeof ONBOARDING_DOCUMENT_TYPES)[number];

export const SYSTEM_GENERATED_DOCUMENT_TYPES: readonly OnboardingDocumentType[] =
  ['signed_indemnity_form'];

export const UPLOADABLE_DOCUMENT_TYPES: readonly OnboardingDocumentType[] =
  ONBOARDING_DOCUMENT_TYPES.filter(
    (type) => !SYSTEM_GENERATED_DOCUMENT_TYPES.includes(type),
  );

// The two applicant types submit different paperwork. One map keyed by type is
// what stops the submit gate drifting from the upload screen.
export const REQUIRED_DOCUMENTS_BY_APPLICANT_TYPE: Record<
  OnboardingApplicantType,
  readonly OnboardingDocumentType[]
> = {
  enterprise: [
    'customer_request_letter',
    'cac_document',
    'tax_certificate_or_tin',
    'signature_card',
    'utility_bill',
    'identification_card',
    'proof_of_ownership',
    'vehicle_license',
  ],
  owner_operator: ['proof_of_ownership', 'vehicle_license'],
};

/**
 * Document types supplied once per vehicle rather than once per application.
 * A licence belongs to a vehicle, so the submit gate counts them against the
 * vehicles on the application, not against a single slot.
 */
export const PER_VEHICLE_DOCUMENT_TYPES: readonly OnboardingDocumentType[] = [
  'vehicle_license',
];

export const ONBOARDING_IDENTIFICATION_TYPES = [
  'nin',
  'drivers_licence',
  'passport',
] as const;
export type OnboardingIdentificationType =
  (typeof ONBOARDING_IDENTIFICATION_TYPES)[number];

import type { OnboardingStage } from './onboarding-stage';

export const ONBOARDING_APPLICATION_STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'changes_requested',
  'approved',
  'rejected',
] as const;
export type OnboardingApplicationStatus =
  (typeof ONBOARDING_APPLICATION_STATUSES)[number];

export const ONBOARDING_DOCUMENT_STATUSES = [
  'pending',
  'approved',
  'rejected',
] as const;
export type OnboardingDocumentStatus =
  (typeof ONBOARDING_DOCUMENT_STATUSES)[number];

// The billing address is verified the same way as the business one, through
// the same codes table, because it is the same problem: an address nobody
// proved reaches the customer.
export const ONBOARDING_VERIFICATION_CHANNELS = [
  'email',
  'sms',
  'billing_email',
] as const;
export type OnboardingVerificationChannel =
  (typeof ONBOARDING_VERIFICATION_CHANNELS)[number];

export type StoredOnboardingApplication = {
  id: string;
  reference: string;
  tokenHash: string;
  applicantType: OnboardingApplicantType;
  organizationName: string;
  businessEmail: string;
  organizationPhone: string;
  contactFullName: string;
  contactRole: string | null;
  streetAddress: string;
  city: string;
  state: string;
  /**
   * Registry identifiers the automated checks run against. They are optional
   * because the application form does not yet collect them; an application
   * without them cannot be decided automatically and falls to manual review.
   */
  rcNumber: string | null;
  taxIdentificationNumber: string | null;
  identificationType: OnboardingIdentificationType | null;
  identificationNumber: string | null;
  /** The M2M licence the applicant chose, priced per device at payment. */
  m2mPlanCode: string | null;
  /** Where the invoice and receipt go. Verified before any money moves. */
  billingEmail: string | null;
  billingEmailVerifiedAt: Date | null;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  status: OnboardingApplicationStatus;
  /** How far along the onboarding is, separate from what was decided. */
  stage: OnboardingStage;
  submittedAt: Date | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  decisionReason: string | null;
  tenantId: string | null;
  /**
   * What happened to the setup link the last time it was sent.
   *
   * `sent` means the mail transport accepted it, which is not the same as the
   * recipient receiving it — there is no bounce feedback, so a link that is
   * accepted and then rejected downstream still reads as sent.
   */
  setupLinkStatus: OnboardingSetupLinkStatus | null;
  setupLinkSentAt: Date | null;
  setupLinkError: string | null;
  setupLinkAttempts: number;
  /** When the applicant was emailed that payment is open; set once, never cleared. */
  paymentNotifiedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export const ONBOARDING_SETUP_LINK_STATUSES = ['sent', 'failed'] as const;
export type OnboardingSetupLinkStatus =
  (typeof ONBOARDING_SETUP_LINK_STATUSES)[number];

export const ONBOARDING_VEHICLE_TYPES = [
  'truck',
  'van',
  'bus',
  'car',
  'suv',
  'trailer',
  'motorcycle',
  'tricycle',
] as const;
export type OnboardingVehicleType = (typeof ONBOARDING_VEHICLE_TYPES)[number];

export const ONBOARDING_VEHICLE_PURCHASE_TYPES = [
  'outright',
  'lease',
  'hire_purchase',
  'financed',
  'other',
] as const;
export type OnboardingVehiclePurchaseType =
  (typeof ONBOARDING_VEHICLE_PURCHASE_TYPES)[number];

export type StoredOnboardingApplicationVehicle = {
  id: string;
  applicationId: string;
  registrationNumber: string;
  vehicleType: OnboardingVehicleType;
  make: string;
  model: string;
  year: number | null;
  engineNumber: string | null;
  chassisNumber: string | null;
  color: string | null;
  engineCapacity: string | null;
  odometerReading: number | null;
  purchaseType: OnboardingVehiclePurchaseType | null;
  /** Free text, required only when purchaseType is `other`. */
  purchaseTypeOther: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type StoredOnboardingDeviceRequest = {
  id: string;
  applicationId: string;
  quantity: number;
  useCase: string;
  notes: string | null;
  /** The stock amount the applicant explicitly accepted when inventory was short. */
  confirmedAvailableQuantity?: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type StoredOnboardingApplicationDocument = {
  id: string;
  applicationId: string;
  /** Set for per-vehicle document types, null for application-wide ones. */
  vehicleId: string | null;
  // Set when the application is approved. The bytes never move out of the
  // platform's own prefix, so this column is what says whose document it is.
  tenantId: string | null;
  documentType: OnboardingDocumentType;
  documentName: string;
  fileKey: string;
  /** SHA-256 of the stored bytes, used to spot the same file twice. */
  fileHash: string | null;
  fileSize: number;
  mimeType: string;
  status: OnboardingDocumentStatus;
  rejectionReason: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type StoredOnboardingVerificationCode = {
  id: string;
  applicationId: string;
  channel: OnboardingVerificationChannel;
  codeHash: string;
  destination: string;
  attempts: number;
  consumedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
};

export type OnboardingApplicationQueueFilters = {
  status?: OnboardingApplicationStatus;
  applicantType?: OnboardingApplicantType;
  search?: string;
  page?: number;
  limit?: number;
};

export interface OnboardingApplicationRepository {
  save(application: StoredOnboardingApplication): Promise<void>;
  findById(id: string): Promise<StoredOnboardingApplication | null>;
  findByReference(
    reference: string,
  ): Promise<StoredOnboardingApplication | null>;
  findLiveByBusinessEmail(
    businessEmail: string,
  ): Promise<StoredOnboardingApplication | null>;
  /** The review queue: drafts only when asked for by status. See inReviewQueue. */
  findForReview(filters?: OnboardingApplicationQueueFilters): Promise<{
    items: StoredOnboardingApplication[];
    total: number;
  }>;
  /**
   * Applications the applicant walked away from: still theirs to edit, and not
   * touched since `lastActivityBefore`. Batched, because a sweep that loads
   * every abandoned application at once is the one that falls over first.
   */
  findAbandoned(
    lastActivityBefore: Date,
    limit: number,
  ): Promise<StoredOnboardingApplication[]>;
  /** Approved applications waiting at a stage, oldest first; the sweeps' work list. */
  findApprovedAtStage(
    stage: OnboardingStage,
    limit: number,
  ): Promise<StoredOnboardingApplication[]>;
  /** Installation-stage applications whose last setup email failed before `attemptedBefore`. */
  findSetupLinkFailed(
    attemptedBefore: Date,
    limit: number,
  ): Promise<StoredOnboardingApplication[]>;
  /** Records that the payment-open email is being sent; true for the first caller only. */
  claimPaymentNotice(id: string, at: Date): Promise<boolean>;
  /** Removes the application and everything filed against it. */
  deleteApplication(id: string): Promise<void>;

  saveVehicle(vehicle: StoredOnboardingApplicationVehicle): Promise<void>;
  findVehicleById(
    id: string,
  ): Promise<StoredOnboardingApplicationVehicle | null>;
  findVehiclesByApplicationId(
    applicationId: string,
  ): Promise<StoredOnboardingApplicationVehicle[]>;
  findVehicleByRegistration(
    applicationId: string,
    registrationNumber: string,
  ): Promise<StoredOnboardingApplicationVehicle | null>;
  deleteVehicle(id: string): Promise<void>;

  saveDeviceRequest(request: StoredOnboardingDeviceRequest): Promise<void>;
  findDeviceRequestById(
    id: string,
  ): Promise<StoredOnboardingDeviceRequest | null>;
  findDeviceRequestsByApplicationId(
    applicationId: string,
  ): Promise<StoredOnboardingDeviceRequest[]>;
  deleteDeviceRequest(id: string): Promise<void>;

  saveDocument(document: StoredOnboardingApplicationDocument): Promise<void>;
  findDocumentById(
    id: string,
  ): Promise<StoredOnboardingApplicationDocument | null>;
  findDocumentsByApplicationId(
    applicationId: string,
  ): Promise<StoredOnboardingApplicationDocument[]>;
  findDocumentsByTenantId(
    tenantId: string,
  ): Promise<StoredOnboardingApplicationDocument[]>;
  assignDocumentsToTenant(
    applicationId: string,
    tenantId: string,
  ): Promise<void>;
  deleteDocument(id: string): Promise<void>;

  saveVerificationCode(
    code: StoredOnboardingVerificationCode,
  ): Promise<void>;
  findActiveVerificationCode(
    applicationId: string,
    channel: OnboardingVerificationChannel,
  ): Promise<StoredOnboardingVerificationCode | null>;
  /** The newest code sent, whether or not it has since been used up. */
  findLatestVerificationCode(
    applicationId: string,
    channel: OnboardingVerificationChannel,
  ): Promise<StoredOnboardingVerificationCode | null>;
  countRecentVerificationCodes(
    applicationId: string,
    channel: OnboardingVerificationChannel,
    since: Date,
  ): Promise<number>;
  invalidateVerificationCodes(
    applicationId: string,
    channel: OnboardingVerificationChannel,
  ): Promise<void>;
}

export const ONBOARDING_APPLICATION_REPOSITORY = Symbol(
  'ONBOARDING_APPLICATION_REPOSITORY',
);

/**
 * A draft is still the applicant's, so the review queue leaves it out unless
 * the reviewer asks for drafts by status.
 */
export function inReviewQueue(
  status: OnboardingApplicationStatus,
  wanted?: OnboardingApplicationStatus,
): boolean {
  return wanted ? status === wanted : status !== 'draft';
}
