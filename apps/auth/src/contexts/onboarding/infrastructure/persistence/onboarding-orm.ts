import { EntitySchema } from '@mikro-orm/core';

/* ── Onboarding Applications ─────────────────────────── */

export class OnboardingApplicationRecord {
  setupLinkStatus?: string | null;
  setupLinkSentAt?: Date | null;
  setupLinkError?: string | null;
  setupLinkAttempts?: number;
  id!: string;
  reference!: string;
  tokenHash!: string;
  applicantType!: string;
  organizationName!: string;
  businessEmail!: string;
  organizationPhone!: string;
  contactFullName!: string;
  contactRole!: string;
  streetAddress!: string;
  city!: string;
  state!: string;
  emailVerifiedAt!: Date | null;
  phoneVerifiedAt!: Date | null;
  status!: string;
  submittedAt!: Date | null;
  reviewedBy!: string | null;
  reviewedAt!: Date | null;
  decisionReason!: string | null;
  tenantId!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export const OnboardingApplicationRecordSchema =
  new EntitySchema<OnboardingApplicationRecord>({
    class: OnboardingApplicationRecord,
    tableName: 'onboarding_applications',
    properties: {
      id: { type: 'string', primary: true },
      reference: { type: 'string', length: 32, unique: true },
      tokenHash: { fieldName: 'token_hash', type: 'string', length: 128, unique: true },
      setupLinkStatus: { fieldName: 'setup_link_status', type: 'string', length: 16, nullable: true },
      setupLinkSentAt: { fieldName: 'setup_link_sent_at', type: 'datetime', nullable: true },
      setupLinkError: { fieldName: 'setup_link_error', type: 'text', nullable: true },
      setupLinkAttempts: { fieldName: 'setup_link_attempts', type: 'number', default: 0 },
      applicantType: { fieldName: 'applicant_type', type: 'string', length: 32 },
      organizationName: { fieldName: 'organization_name', type: 'string', length: 160 },
      businessEmail: { fieldName: 'business_email', type: 'string', length: 254, index: true },
      organizationPhone: { fieldName: 'organization_phone', type: 'string', length: 20 },
      contactFullName: { fieldName: 'contact_full_name', type: 'string', length: 80 },
      contactRole: { fieldName: 'contact_role', type: 'string', length: 80 },
      streetAddress: { fieldName: 'street_address', type: 'string', length: 200 },
      city: { type: 'string', length: 80 },
      state: { type: 'string', length: 64 },
      emailVerifiedAt: { fieldName: 'email_verified_at', type: 'datetime', nullable: true },
      phoneVerifiedAt: { fieldName: 'phone_verified_at', type: 'datetime', nullable: true },
      status: { type: 'string', length: 32, default: 'draft', index: true },
      submittedAt: { fieldName: 'submitted_at', type: 'datetime', nullable: true },
      reviewedBy: { fieldName: 'reviewed_by', type: 'string', length: 64, nullable: true },
      reviewedAt: { fieldName: 'reviewed_at', type: 'datetime', nullable: true },
      decisionReason: { fieldName: 'decision_reason', type: 'text', nullable: true },
      tenantId: { fieldName: 'tenant_id', type: 'string', length: 64, nullable: true },
      createdAt: { fieldName: 'created_at', type: 'datetime', defaultRaw: 'now()' },
      updatedAt: { fieldName: 'updated_at', type: 'datetime', onUpdate: () => new Date(), defaultRaw: 'now()' },
    },
  });

export class OnboardingApplicationDocumentRecord {
  id!: string;
  applicationId!: string;
  tenantId!: string | null;
  documentType!: string;
  documentName!: string;
  fileKey!: string;
  fileSize!: number;
  mimeType!: string;
  status!: string;
  rejectionReason!: string | null;
  reviewedBy!: string | null;
  reviewedAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export const OnboardingApplicationDocumentRecordSchema =
  new EntitySchema<OnboardingApplicationDocumentRecord>({
    class: OnboardingApplicationDocumentRecord,
    tableName: 'onboarding_application_documents',
    properties: {
      id: { type: 'string', primary: true },
      applicationId: { fieldName: 'application_id', type: 'string', length: 64, index: true },
      tenantId: { fieldName: 'tenant_id', type: 'string', length: 64, nullable: true, index: true },
      documentType: { fieldName: 'document_type', type: 'string', length: 64 },
      documentName: { fieldName: 'document_name', type: 'string', length: 255 },
      fileKey: { fieldName: 'file_key', type: 'string', length: 512 },
      fileSize: { fieldName: 'file_size', type: 'number', default: 0 },
      mimeType: { fieldName: 'mime_type', type: 'string', length: 100 },
      status: { type: 'string', length: 32, default: 'pending' },
      rejectionReason: { fieldName: 'rejection_reason', type: 'string', length: 1000, nullable: true },
      reviewedBy: { fieldName: 'reviewed_by', type: 'string', length: 64, nullable: true },
      reviewedAt: { fieldName: 'reviewed_at', type: 'datetime', nullable: true },
      createdAt: { fieldName: 'created_at', type: 'datetime', defaultRaw: 'now()' },
      updatedAt: { fieldName: 'updated_at', type: 'datetime', onUpdate: () => new Date(), defaultRaw: 'now()' },
    },
  });

export class OnboardingVerificationCodeRecord {
  id!: string;
  applicationId!: string;
  channel!: string;
  codeHash!: string;
  destination!: string;
  attempts!: number;
  consumedAt!: Date | null;
  expiresAt!: Date;
  createdAt!: Date;
}

export const OnboardingVerificationCodeRecordSchema =
  new EntitySchema<OnboardingVerificationCodeRecord>({
    class: OnboardingVerificationCodeRecord,
    tableName: 'onboarding_verification_codes',
    properties: {
      id: { type: 'string', primary: true },
      applicationId: { fieldName: 'application_id', type: 'string', length: 64, index: true },
      channel: { type: 'string', length: 16 },
      codeHash: { fieldName: 'code_hash', type: 'string', length: 128 },
      destination: { type: 'string', length: 254 },
      attempts: { type: 'number', default: 0 },
      consumedAt: { fieldName: 'consumed_at', type: 'datetime', nullable: true },
      expiresAt: { fieldName: 'expires_at', type: 'datetime' },
      createdAt: { fieldName: 'created_at', type: 'datetime', defaultRaw: 'now()' },
    },
  });
