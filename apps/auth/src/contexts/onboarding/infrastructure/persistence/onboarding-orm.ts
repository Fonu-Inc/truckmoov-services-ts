import { EntitySchema } from '@mikro-orm/core';

/* ── Onboarding Applications ─────────────────────────── */

export class OnboardingApplicationRecord {
  m2mPlanCode?: string | null;
  rcNumber?: string | null;
  taxIdentificationNumber?: string | null;
  identificationType?: string | null;
  identificationNumber?: string | null;
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
  contactRole!: string | null;
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
      contactRole: { fieldName: 'contact_role', type: 'string', length: 80, nullable: true },
      rcNumber: { fieldName: 'rc_number', type: 'string', length: 20, nullable: true, index: true },
      taxIdentificationNumber: { fieldName: 'tax_identification_number', type: 'string', length: 24, nullable: true, index: true },
      identificationType: { fieldName: 'identification_type', type: 'string', length: 32, nullable: true },
      identificationNumber: { fieldName: 'identification_number', type: 'string', length: 24, nullable: true, index: true },
      m2mPlanCode: { fieldName: 'm2m_plan_code', type: 'string', length: 64, nullable: true },
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

export class OnboardingApplicationVehicleRecord {
  id!: string;
  applicationId!: string;
  registrationNumber!: string;
  vehicleType!: string;
  make!: string;
  model!: string;
  year!: number | null;
  engineNumber!: string | null;
  chassisNumber!: string | null;
  color!: string | null;
  engineCapacity!: string | null;
  odometerReading!: number | null;
  purchaseType!: string | null;
  purchaseTypeOther!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export const OnboardingApplicationVehicleRecordSchema =
  new EntitySchema<OnboardingApplicationVehicleRecord>({
    class: OnboardingApplicationVehicleRecord,
    tableName: 'onboarding_application_vehicles',
    properties: {
      id: { type: 'string', primary: true },
      applicationId: { fieldName: 'application_id', type: 'string', length: 64, index: true },
      registrationNumber: { fieldName: 'registration_number', type: 'string', length: 20 },
      vehicleType: { fieldName: 'vehicle_type', type: 'string', length: 32 },
      make: { type: 'string', length: 80 },
      model: { type: 'string', length: 80 },
      year: { type: 'number', nullable: true },
      engineNumber: { fieldName: 'engine_number', type: 'string', length: 64, nullable: true },
      chassisNumber: { fieldName: 'chassis_number', type: 'string', length: 64, nullable: true },
      color: { type: 'string', length: 40, nullable: true },
      engineCapacity: { fieldName: 'engine_capacity', type: 'string', length: 32, nullable: true },
      odometerReading: { fieldName: 'odometer_reading', type: 'number', nullable: true },
      purchaseType: { fieldName: 'purchase_type', type: 'string', length: 32, nullable: true },
      purchaseTypeOther: { fieldName: 'purchase_type_other', type: 'string', length: 120, nullable: true },
      createdAt: { fieldName: 'created_at', type: 'datetime', defaultRaw: 'now()' },
      updatedAt: { fieldName: 'updated_at', type: 'datetime', onUpdate: () => new Date(), defaultRaw: 'now()' },
    },
  });

export class OnboardingDeviceRequestRecord {
  id!: string;
  applicationId!: string;
  quantity!: number;
  useCase!: string;
  notes!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export const OnboardingDeviceRequestRecordSchema =
  new EntitySchema<OnboardingDeviceRequestRecord>({
    class: OnboardingDeviceRequestRecord,
    tableName: 'onboarding_device_requests',
    properties: {
      id: { type: 'string', primary: true },
      applicationId: { fieldName: 'application_id', type: 'string', length: 64, index: true },
      quantity: { type: 'number', default: 1 },
      useCase: { fieldName: 'use_case', type: 'text' },
      notes: { type: 'text', nullable: true },
      createdAt: { fieldName: 'created_at', type: 'datetime', defaultRaw: 'now()' },
      updatedAt: { fieldName: 'updated_at', type: 'datetime', onUpdate: () => new Date(), defaultRaw: 'now()' },
    },
  });

export class OnboardingApplicationDocumentRecord {
  fileHash?: string | null;
  id!: string;
  applicationId!: string;
  vehicleId!: string | null;
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
      vehicleId: { fieldName: 'vehicle_id', type: 'string', length: 64, nullable: true, index: true },
      tenantId: { fieldName: 'tenant_id', type: 'string', length: 64, nullable: true, index: true },
      documentType: { fieldName: 'document_type', type: 'string', length: 64 },
      documentName: { fieldName: 'document_name', type: 'string', length: 255 },
      fileKey: { fieldName: 'file_key', type: 'string', length: 512 },
      fileHash: { fieldName: 'file_hash', type: 'string', length: 64, nullable: true, index: true },
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

/* ── M2M Licence Plans ──────────────────────────────── */

export class M2mLicensePlanRecord {
  id!: string;
  code!: string;
  name!: string;
  description!: string;
  perDeviceYear1Ngn!: number;
  perDeviceRenewalNgn!: number;
  sortOrder!: number;
  isActive!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
}

export const M2mLicensePlanRecordSchema =
  new EntitySchema<M2mLicensePlanRecord>({
    class: M2mLicensePlanRecord,
    tableName: 'm2m_license_plans',
    properties: {
      id: { type: 'string', primary: true },
      code: { type: 'string', length: 64, unique: true },
      name: { type: 'string', length: 120 },
      description: { type: 'string', length: 255 },
      perDeviceYear1Ngn: { fieldName: 'per_device_year1_ngn', type: 'number' },
      perDeviceRenewalNgn: { fieldName: 'per_device_renewal_ngn', type: 'number' },
      sortOrder: { fieldName: 'sort_order', type: 'number', default: 0 },
      isActive: { fieldName: 'is_active', type: 'boolean', default: true },
      createdAt: { fieldName: 'created_at', type: 'datetime', defaultRaw: 'now()' },
      updatedAt: { fieldName: 'updated_at', type: 'datetime', onUpdate: () => new Date(), defaultRaw: 'now()' },
    },
  });

/* ── Indemnity Agreement ────────────────────────────── */

export class IndemnityTemplateRecord {
  id!: string;
  version!: string;
  title!: string;
  body!: string;
  bodyHash!: string;
  isActive!: boolean;
  createdAt!: Date;
}

export const IndemnityTemplateRecordSchema =
  new EntitySchema<IndemnityTemplateRecord>({
    class: IndemnityTemplateRecord,
    tableName: 'onboarding_indemnity_templates',
    properties: {
      id: { type: 'string', primary: true },
      version: { type: 'string', length: 32, unique: true },
      title: { type: 'string', length: 160 },
      body: { type: 'text' },
      bodyHash: { fieldName: 'body_hash', type: 'string', length: 64 },
      isActive: { fieldName: 'is_active', type: 'boolean', default: true },
      createdAt: { fieldName: 'created_at', type: 'datetime', defaultRaw: 'now()' },
    },
  });

export class IndemnitySignatureRecord {
  id!: string;
  applicationId!: string;
  templateVersion!: string;
  templateHash!: string;
  signerName!: string;
  method!: string;
  fileKey!: string;
  mimeType!: string;
  ipAddress!: string | null;
  userAgent!: string | null;
  signedAt!: Date;
}

export const IndemnitySignatureRecordSchema =
  new EntitySchema<IndemnitySignatureRecord>({
    class: IndemnitySignatureRecord,
    tableName: 'onboarding_indemnity_signatures',
    properties: {
      id: { type: 'string', primary: true },
      applicationId: { fieldName: 'application_id', type: 'string', length: 64, unique: true },
      templateVersion: { fieldName: 'template_version', type: 'string', length: 32 },
      templateHash: { fieldName: 'template_hash', type: 'string', length: 64 },
      signerName: { fieldName: 'signer_name', type: 'string', length: 160 },
      method: { type: 'string', length: 16 },
      fileKey: { fieldName: 'file_key', type: 'string', length: 512 },
      mimeType: { fieldName: 'mime_type', type: 'string', length: 100 },
      ipAddress: { fieldName: 'ip_address', type: 'string', length: 64, nullable: true },
      userAgent: { fieldName: 'user_agent', type: 'string', length: 512, nullable: true },
      signedAt: { fieldName: 'signed_at', type: 'datetime', defaultRaw: 'now()' },
    },
  });

/* ── Identity Claims ────────────────────────────────── */

export class OnboardingIdentityClaimRecord {
  id!: string;
  applicationId!: string;
  claimType!: string;
  claimValue!: string;
  createdAt!: Date;
}

export const OnboardingIdentityClaimRecordSchema =
  new EntitySchema<OnboardingIdentityClaimRecord>({
    class: OnboardingIdentityClaimRecord,
    tableName: 'onboarding_identity_claims',
    properties: {
      id: { type: 'string', primary: true },
      applicationId: { fieldName: 'application_id', type: 'string', length: 64, index: true },
      claimType: { fieldName: 'claim_type', type: 'string', length: 40, index: true },
      claimValue: { fieldName: 'claim_value', type: 'string', length: 128, index: true },
      createdAt: { fieldName: 'created_at', type: 'datetime', defaultRaw: 'now()' },
    },
  });

/* ── Verification Results ───────────────────────────── */

export class OnboardingVerificationResultRecord {
  id!: string;
  applicationId!: string;
  check!: string;
  verdict!: string;
  reference!: string;
  summary!: string;
  fields!: unknown;
  provider!: string;
  checkedAt!: Date;
}

export const OnboardingVerificationResultRecordSchema =
  new EntitySchema<OnboardingVerificationResultRecord>({
    class: OnboardingVerificationResultRecord,
    tableName: 'onboarding_verification_results',
    properties: {
      id: { type: 'string', primary: true },
      applicationId: { fieldName: 'application_id', type: 'string', length: 64, index: true },
      check: { type: 'string', length: 40 },
      verdict: { type: 'string', length: 20 },
      reference: { type: 'string', length: 128 },
      summary: { type: 'text' },
      fields: { type: 'json' },
      provider: { type: 'string', length: 40 },
      checkedAt: { fieldName: 'checked_at', type: 'datetime', defaultRaw: 'now()' },
    },
  });
