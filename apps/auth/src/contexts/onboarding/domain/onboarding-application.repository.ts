export const ONBOARDING_APPLICANT_TYPES = [
  'fleet_provider',
  'owner_operator',
] as const;
export type OnboardingApplicantType =
  (typeof ONBOARDING_APPLICANT_TYPES)[number];

// Both applicant types submit the same paperwork. Kept as one list rather than
// a per-type map so the submit gate cannot drift from the upload screen.
export const ONBOARDING_DOCUMENT_TYPES = [
  'customer_request_letter',
  'letter_of_authorization',
  'signed_indemnity_form',
  'cac_document',
  'tax_certificate_or_tin',
  'signature_card',
  'utility_bill',
  'identification_card',
  'form_c02_c07',
  'agreement_form',
] as const;
export type OnboardingDocumentType =
  (typeof ONBOARDING_DOCUMENT_TYPES)[number];

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

export const ONBOARDING_VERIFICATION_CHANNELS = ['email', 'sms'] as const;
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
  contactRole: string;
  streetAddress: string;
  city: string;
  state: string;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  status: OnboardingApplicationStatus;
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
  createdAt: Date;
  updatedAt: Date;
};

export const ONBOARDING_SETUP_LINK_STATUSES = ['sent', 'failed'] as const;
export type OnboardingSetupLinkStatus =
  (typeof ONBOARDING_SETUP_LINK_STATUSES)[number];

export type StoredOnboardingApplicationDocument = {
  id: string;
  applicationId: string;
  // Set when the application is approved. The bytes never move out of the
  // platform's own prefix, so this column is what says whose document it is.
  tenantId: string | null;
  documentType: OnboardingDocumentType;
  documentName: string;
  fileKey: string;
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
  findForReview(filters?: OnboardingApplicationQueueFilters): Promise<{
    items: StoredOnboardingApplication[];
    total: number;
  }>;

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
