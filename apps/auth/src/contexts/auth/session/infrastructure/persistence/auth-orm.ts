import { EntitySchema } from '@mikro-orm/core';
import { MikroORM } from '@mikro-orm/postgresql';
import { ROLE_SEED_ROWS, roleFromId, roleToId } from '@shared/rbac';
import { runMigrationsExclusively } from "@shared/db";
import {
  InstallationDeviceAssignmentRecordSchema,
  InstallationOrderRecordSchema,
  InstallerRecordSchema,
} from '@auth/installation/infrastructure/persistence/installation-orm';
import {
  OnboardingPaymentRecordSchema,
  OnboardingVerificationResultRecordSchema,
  OnboardingIdentityClaimRecordSchema,
  IndemnitySignatureRecordSchema,
  IndemnityTemplateRecordSchema,
  M2mLicensePlanRecordSchema,
  OnboardingApplicationDocumentRecordSchema,
  OnboardingApplicationRecordSchema,
  OnboardingApplicationVehicleRecordSchema,
  OnboardingDeviceRequestRecordSchema,
  OnboardingVerificationCodeRecordSchema,
} from '@auth/onboarding/infrastructure/persistence/onboarding-orm';

export type DbConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  dbName: string;
  poolMin?: number;
  poolMax?: number;
};

export class AuthRoleRecord {
  id!: number;
  name!: string;
}

export const AuthRoleRecordSchema = new EntitySchema<AuthRoleRecord>({
  class: AuthRoleRecord,
  tableName: 'auth_roles',
  properties: {
    id: { type: 'number', primary: true },
    name: { type: 'string', length: 64, unique: true },
  },
});

/* ── Session ─────────────────────────────────────────── */

export class AuthSessionRecord {
  refreshToken!: string;
  userId!: string;
  email!: string;
  roleId!: number;
  tenantId!: string;
  updatedAt!: Date;
}

export const AuthSessionRecordSchema = new EntitySchema<AuthSessionRecord>({
  class: AuthSessionRecord,
  tableName: 'auth_sessions',
  properties: {
    refreshToken: { type: 'string', primary: true },
    userId: { type: 'string', length: 64 },
    email: { type: 'string', length: 128 },
    roleId: { type: 'number' },
    tenantId: { type: 'string', length: 64, default: 'default' },
    updatedAt: {
      type: 'datetime',
      onUpdate: () => new Date(),
      defaultRaw: 'now()',
    },
  },
});

/* ── User ────────────────────────────────────────────── */

export class TenantTerminationRecord {
  tenantId!: string;
  reason!: string;
  terminatedBy!: string;
  terminatedAt!: Date;
  simsDeactivated!: number;
  usersDisabled!: number;
}

export const TenantTerminationRecordSchema = new EntitySchema<TenantTerminationRecord>({
  class: TenantTerminationRecord,
  tableName: 'tenant_terminations',
  properties: {
    tenantId: { fieldName: 'tenant_id', type: 'string', length: 64, primary: true },
    reason: { type: 'text' },
    terminatedBy: { fieldName: 'terminated_by', type: 'string', length: 64 },
    terminatedAt: { fieldName: 'terminated_at', type: 'datetime', defaultRaw: 'now()' },
    simsDeactivated: { fieldName: 'sims_deactivated', type: 'number', default: 0 },
    usersDisabled: { fieldName: 'users_disabled', type: 'number', default: 0 },
  },
});

export class TwoFactorEnrolmentRecord {
  userId!: string;
  secretCiphertext!: string;
  confirmedAt?: Date | null;
  recoveryCodeHashes!: string[];
  createdAt!: Date;
  updatedAt!: Date;
}

export const TwoFactorEnrolmentRecordSchema = new EntitySchema<TwoFactorEnrolmentRecord>({
  class: TwoFactorEnrolmentRecord,
  tableName: 'auth_two_factor_enrolments',
  properties: {
    userId: { fieldName: 'user_id', type: 'string', length: 64, primary: true },
    secretCiphertext: { fieldName: 'secret_ciphertext', type: 'text' },
    confirmedAt: { fieldName: 'confirmed_at', type: 'datetime', nullable: true },
    recoveryCodeHashes: { fieldName: 'recovery_code_hashes', type: 'json', defaultRaw: "'[]'" },
    createdAt: { fieldName: 'created_at', type: 'datetime', defaultRaw: 'now()' },
    updatedAt: { fieldName: 'updated_at', type: 'datetime', onUpdate: () => new Date(), defaultRaw: 'now()' },
  },
});

export class AuthUserRecord {
  id!: string;
  email!: string;
  passwordHash!: string;
  roleId!: number;
  tenantId!: string;
  accountStatus!: string;
  customRoleId?: string | null;
  emailVerificationToken?: string | null;
  profile?: {
    fullName: string | null;
    phoneNumber: string | null;
    address: string | null;
    profilePictureUrl: string | null;
  };
  notificationPreferences?: {
    emailAlerts: boolean;
    smsAlerts: boolean;
    pushAlerts: boolean;
    incidentAlerts: boolean;
    jobUpdates: boolean;
    marketingAnnouncements: boolean;
  };
  dispatcherPreferences?: {
    timezone: string;
    shiftStart: string;
    shiftEnd: string;
    workDays: number[];
  };
  createdAt!: Date;
}

export const AuthUserRecordSchema = new EntitySchema<AuthUserRecord>({
  class: AuthUserRecord,
  tableName: 'auth_users',
  properties: {
    id: { type: 'string', primary: true },
    email: { type: 'string', length: 128, unique: true },
    passwordHash: { type: 'string' },
    roleId: { type: 'number' },
    tenantId: { type: 'string', length: 64, default: 'default' },
    accountStatus: { type: 'string', length: 20, default: 'enabled' },
    customRoleId: { fieldName: 'custom_role_id', type: 'string', length: 64, nullable: true },
    emailVerificationToken: { type: 'string', length: 128, nullable: true },
    profile: { type: 'json', nullable: true },
    notificationPreferences: { type: 'json', nullable: true },
    dispatcherPreferences: { type: 'json', nullable: true },
    createdAt: { type: 'datetime', defaultRaw: 'now()' },
  },
});

/* ── Organization Settings ───────────────────────────── */

export class OrganizationSettingsRecord {
  tenantId!: string;
  branding!: {
    organizationName: string;
    contactEmail: string | null;
    billingEmail: string | null;
    phoneNumber: string | null;
    address: string | null;
    logoUrl: string | null;
    profilePictureUrl: string | null;
    primaryColor: string | null;
    secondaryColor: string | null;
    accentColor: string | null;
    successColor: string | null;
    warningColor: string | null;
    destructiveColor: string | null;
    sidebarBackground: string | null;
    sidebarText: string | null;
    sidebarAccent: string | null;
  };
  defaults!: {
    timezone: string;
    language: string;
    currency: string;
    dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
    weekStartsOn: 'monday' | 'sunday';
  };
  updatedAt!: Date;
}

export const OrganizationSettingsRecordSchema =
  new EntitySchema<OrganizationSettingsRecord>({
    class: OrganizationSettingsRecord,
    tableName: 'auth_organization_settings',
    properties: {
      tenantId: { type: 'string', primary: true },
      branding: { type: 'json' },
      defaults: { type: 'json' },
      updatedAt: {
        type: 'datetime',
        onUpdate: () => new Date(),
        defaultRaw: 'now()',
      },
    },
  });

/* ── System Settings ────────────────────────────────── */

export class AiGovernanceRecord {
  id!: string;
  matchingEnabled!: boolean;
  providers!: unknown;
  rateLimits!: unknown;
  dataProtection!: unknown;
  updatedByUserId!: string | null;
  updatedAt!: Date;
}

export const AiGovernanceRecordSchema = new EntitySchema<AiGovernanceRecord>({
  class: AiGovernanceRecord,
  tableName: 'ai_governance_settings',
  properties: {
    id: { type: 'string', primary: true },
    matchingEnabled: { fieldName: 'matching_enabled', type: 'boolean', default: false },
    providers: { type: 'json', defaultRaw: "'[]'" },
    rateLimits: { fieldName: 'rate_limits', type: 'json', defaultRaw: "'{}'" },
    dataProtection: { fieldName: 'data_protection', type: 'json', defaultRaw: "'{}'" },
    updatedByUserId: { fieldName: 'updated_by_user_id', type: 'string', length: 64, nullable: true },
    updatedAt: { fieldName: 'updated_at', type: 'datetime', onUpdate: () => new Date(), defaultRaw: 'now()' },
  },
});

export class AiRequestLogRecord {
  id!: string;
  tenantId!: string;
  provider!: string;
  model!: string;
  feature!: string;
  promptTokens!: number;
  completionTokens!: number;
  totalTokens!: number;
  latencyMs!: number;
  succeeded!: boolean;
  errorMessage!: string | null;
  promptBody!: string | null;
  responseBody!: string | null;
  createdAt!: Date;
}

export const AiRequestLogRecordSchema = new EntitySchema<AiRequestLogRecord>({
  class: AiRequestLogRecord,
  tableName: 'ai_request_log',
  properties: {
    id: { type: 'string', primary: true },
    tenantId: { fieldName: 'tenant_id', type: 'string', length: 64 },
    provider: { type: 'string', length: 32 },
    model: { type: 'string', length: 96 },
    feature: { type: 'string', length: 64 },
    promptTokens: { fieldName: 'prompt_tokens', type: 'number', default: 0 },
    completionTokens: { fieldName: 'completion_tokens', type: 'number', default: 0 },
    totalTokens: { fieldName: 'total_tokens', type: 'number', default: 0 },
    latencyMs: { fieldName: 'latency_ms', type: 'number', default: 0 },
    succeeded: { type: 'boolean', default: true },
    errorMessage: { fieldName: 'error_message', type: 'text', nullable: true },
    promptBody: { fieldName: 'prompt_body', type: 'text', nullable: true },
    responseBody: { fieldName: 'response_body', type: 'text', nullable: true },
    createdAt: { fieldName: 'created_at', type: 'datetime', defaultRaw: 'now()' },
  },
  indexes: [
    { properties: ['tenantId', 'createdAt'] },
    { properties: ['provider', 'createdAt'] },
    { properties: ['createdAt'] },
  ],
});

export class SystemSettingsRecord {
  id!: string;
  platformName!: string;
  supportEmail!: string;
  defaults!: {
    timezone: string;
    language: string;
  };
  features!: {
    allowNewTenantRegistration: boolean;
    maintenanceMode: boolean;
    enableBetaFeatures: boolean;
  };
  retention!: {
    gpsDataRetentionDays: number;
    logRetentionDays: number;
    backupFrequency: 'hourly' | 'daily' | 'weekly';
  };
  security?: {
    requireTwoFactor: boolean;
    sessionTimeoutMinutes: number;
    auditLogging: boolean;
  } | null;
  updatedByUserId!: string | null;
  updatedAt!: Date;
}

export const SystemSettingsRecordSchema =
  new EntitySchema<SystemSettingsRecord>({
    class: SystemSettingsRecord,
    tableName: 'system_settings',
    properties: {
      id: { type: 'string', primary: true },
      platformName: {
        fieldName: 'platform_name',
        type: 'string',
        length: 160,
      },
      supportEmail: {
        fieldName: 'support_email',
        type: 'string',
        length: 255,
      },
      defaults: { type: 'json' },
      features: { type: 'json' },
      retention: { type: 'json' },
      security: { type: 'json', nullable: true },
      updatedByUserId: {
        fieldName: 'updated_by_user_id',
        type: 'string',
        length: 64,
        nullable: true,
      },
      updatedAt: {
        fieldName: 'updated_at',
        type: 'datetime',
        onUpdate: () => new Date(),
        defaultRaw: 'now()',
      },
    },
  });

/* ── Activity Log ───────────────────────────────────── */

export class ActivityLogRecord {
  id!: string;
  tenantId!: string;
  service!: string;
  action!: string;
  entityType!: string;
  entityId!: string;
  summary!: string;
  actorId?: string | null;
  actorRole?: string | null;
  /**
   * Names as they were when the action happened. Denormalised on purpose: a
   * join would show the name the actor has now, or nothing once they are
   * deleted, and an audit row has to say what was true then.
   */
  actorName?: string | null;
  actorEmail?: string | null;
  tenantName?: string | null;
  metadata!: Record<string, unknown>;
  occurredAt!: Date;
  recordedAt!: Date;
  seq!: number;
  prevHash!: string;
  rowHash!: string;
}

export const ActivityLogRecordSchema = new EntitySchema<ActivityLogRecord>({
  class: ActivityLogRecord,
  tableName: 'activity_logs',
  properties: {
    id: { type: 'string', primary: true },
    tenantId: { type: 'string', length: 64, index: true },
    service: { type: 'string', length: 64, index: true },
    action: { type: 'string', length: 128, index: true },
    entityType: { type: 'string', length: 64, index: true },
    entityId: { type: 'string', length: 128, index: true },
    summary: { type: 'string', length: 255 },
    actorId: { type: 'string', length: 128, nullable: true, index: true },
    actorRole: { type: 'string', length: 64, nullable: true },
    actorName: { fieldName: 'actor_name', type: 'string', length: 160, nullable: true },
    actorEmail: { fieldName: 'actor_email', type: 'string', length: 254, nullable: true, index: true },
    tenantName: { fieldName: 'tenant_name', type: 'string', length: 200, nullable: true },
    metadata: { type: 'json', defaultRaw: "'{}'" },
    occurredAt: { type: 'datetime', index: true },
    recordedAt: { type: 'datetime', defaultRaw: 'now()' },
    seq: { type: 'bigint', defaultRaw: "nextval('activity_logs_seq_seq')" },
    prevHash: { fieldName: 'prev_hash', type: 'string', length: 64 },
    rowHash: { fieldName: 'row_hash', type: 'string', length: 64 },
  },
});


/* ── Tenant Mail Credentials ────────────────────────── */

export class TenantMailCredentialRecord {
  tenantId!: string;
  emailAddress!: string;
  displayName!: string | null;
  imapHost!: string;
  imapPort!: number;
  imapUsername!: string;
  imapPasswordCiphertext!: string;
  imapPasswordPreview!: string;
  imapSecure!: boolean;
  smtpHost!: string;
  smtpPort!: number;
  smtpUsername!: string;
  smtpPasswordCiphertext!: string;
  smtpPasswordPreview!: string;
  smtpSecure!: boolean;
  lastVerifiedAt!: Date | null;
  lastError!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export const TenantMailCredentialRecordSchema =
  new EntitySchema<TenantMailCredentialRecord>({
    class: TenantMailCredentialRecord,
    tableName: 'tenant_mail_credentials',
    properties: {
      tenantId: { fieldName: 'tenant_id', type: 'string', length: 64, primary: true },
      emailAddress: { fieldName: 'email_address', type: 'string', length: 255 },
      displayName: { fieldName: 'display_name', type: 'string', length: 255, nullable: true },
      imapHost: { fieldName: 'imap_host', type: 'string', length: 255 },
      imapPort: { fieldName: 'imap_port', type: 'number' },
      imapUsername: { fieldName: 'imap_username', type: 'string', length: 255 },
      imapPasswordCiphertext: { fieldName: 'imap_password_ciphertext', type: 'text' },
      imapPasswordPreview: { fieldName: 'imap_password_preview', type: 'string', length: 32 },
      imapSecure: { fieldName: 'imap_secure', type: 'boolean', defaultRaw: 'true' },
      smtpHost: { fieldName: 'smtp_host', type: 'string', length: 255 },
      smtpPort: { fieldName: 'smtp_port', type: 'number' },
      smtpUsername: { fieldName: 'smtp_username', type: 'string', length: 255 },
      smtpPasswordCiphertext: { fieldName: 'smtp_password_ciphertext', type: 'text' },
      smtpPasswordPreview: { fieldName: 'smtp_password_preview', type: 'string', length: 32 },
      smtpSecure: { fieldName: 'smtp_secure', type: 'boolean', defaultRaw: 'true' },
      lastVerifiedAt: { fieldName: 'last_verified_at', type: 'datetime', nullable: true },
      lastError: { fieldName: 'last_error', type: 'text', nullable: true },
      createdAt: { fieldName: 'created_at', type: 'datetime', defaultRaw: 'now()' },
      updatedAt: { fieldName: 'updated_at', type: 'datetime', onUpdate: () => new Date(), defaultRaw: 'now()' },
    },
  });


/* ── Mailbox ────────────────────────────────────────── */

export class MailThreadRecord {
  id!: string;
  tenantId!: string;
  subject!: string;
  participants!: unknown[];
  messageCount!: number;
  lastMessageAt!: Date;
  hasUnread!: boolean;
  updatedAt!: Date;
}

export const MailThreadRecordSchema = new EntitySchema<MailThreadRecord>({
  class: MailThreadRecord,
  tableName: 'tenant_mail_threads',
  properties: {
    tenantId: { fieldName: 'tenant_id', type: 'string', length: 64, primary: true },
    id: { type: 'string', primary: true },
    subject: { type: 'string', length: 998 },
    participants: { type: 'json', defaultRaw: "'[]'" },
    messageCount: { fieldName: 'message_count', type: 'number', defaultRaw: '0' },
    lastMessageAt: { fieldName: 'last_message_at', type: 'datetime' },
    hasUnread: { fieldName: 'has_unread', type: 'boolean', defaultRaw: 'false' },
    updatedAt: { fieldName: 'updated_at', type: 'datetime', onUpdate: () => new Date(), defaultRaw: 'now()' },
  },
});

export class MailMessageRecord {
  id!: string;
  tenantId!: string;
  threadId!: string;
  messageId!: string;
  inReplyTo!: string | null;
  references!: unknown[];
  folder!: string;
  subject!: string;
  fromAddress!: unknown;
  toAddresses!: unknown[];
  ccAddresses!: unknown[];
  bccAddresses!: unknown[];
  bodyText!: string | null;
  bodyHtml!: string | null;
  attachments!: unknown[];
  sentAt!: Date;
  receivedAt!: Date;
  seen!: boolean;
  starred!: boolean;
  labels!: unknown[];
  uid!: number;
  deliveryStatus!: string;
  deliveryDetail!: string | null;
}

export const MailMessageRecordSchema = new EntitySchema<MailMessageRecord>({
  class: MailMessageRecord,
  tableName: 'tenant_mail_messages',
  properties: {
    id: { type: 'string', primary: true },
    tenantId: { fieldName: 'tenant_id', type: 'string', length: 64, index: true },
    threadId: { fieldName: 'thread_id', type: 'string', index: true },
    messageId: { fieldName: 'message_id', type: 'string', length: 998 },
    inReplyTo: { fieldName: 'in_reply_to', type: 'string', length: 998, nullable: true },
    references: { type: 'json', defaultRaw: "'[]'" },
    folder: { type: 'string', length: 255 },
    subject: { type: 'string', length: 998 },
    fromAddress: { fieldName: 'from_address', type: 'json' },
    toAddresses: { fieldName: 'to_addresses', type: 'json', defaultRaw: "'[]'" },
    ccAddresses: { fieldName: 'cc_addresses', type: 'json', defaultRaw: "'[]'" },
    bccAddresses: { fieldName: 'bcc_addresses', type: 'json', defaultRaw: "'[]'" },
    bodyText: { fieldName: 'body_text', type: 'text', nullable: true },
    bodyHtml: { fieldName: 'body_html', type: 'text', nullable: true },
    attachments: { type: 'json', defaultRaw: "'[]'" },
    sentAt: { fieldName: 'sent_at', type: 'datetime' },
    receivedAt: { fieldName: 'received_at', type: 'datetime', defaultRaw: 'now()' },
    seen: { type: 'boolean', defaultRaw: 'false' },
    starred: { type: 'boolean', defaultRaw: 'false' },
    labels: { type: 'json', defaultRaw: "'[]'" },
    uid: { type: 'bigint', defaultRaw: '0' },
    deliveryStatus: { fieldName: 'delivery_status', type: 'string', length: 16, defaultRaw: "'unknown'" },
    deliveryDetail: { fieldName: 'delivery_detail', type: 'text', nullable: true },
  },
});

export class MailSyncStateRecord {
  tenantId!: string;
  folder!: string;
  lastUid!: number;
  lastSyncedAt!: Date | null;
  lastError!: string | null;
}

export const MailSyncStateRecordSchema = new EntitySchema<MailSyncStateRecord>({
  class: MailSyncStateRecord,
  tableName: 'tenant_mail_sync_state',
  properties: {
    tenantId: { fieldName: 'tenant_id', type: 'string', length: 64, primary: true },
    folder: { type: 'string', length: 255, primary: true },
    lastUid: { fieldName: 'last_uid', type: 'bigint', defaultRaw: '0' },
    lastSyncedAt: { fieldName: 'last_synced_at', type: 'datetime', nullable: true },
    lastError: { fieldName: 'last_error', type: 'text', nullable: true },
  },
});


/* ── Platform Alert Settings ────────────────────────── */

export class PlatformAlertSettingRecord {
  alertType!: string;
  enabled!: boolean;
  channels!: unknown[];
  recipients!: unknown[];
  minSeverity!: string;
  updatedAt!: Date;
  updatedBy!: string | null;
}

export const PlatformAlertSettingRecordSchema =
  new EntitySchema<PlatformAlertSettingRecord>({
    class: PlatformAlertSettingRecord,
    tableName: 'platform_alert_settings',
    properties: {
      alertType: { fieldName: 'alert_type', type: 'string', length: 64, primary: true },
      enabled: { type: 'boolean', defaultRaw: 'true' },
      channels: { type: 'json', defaultRaw: "'[]'" },
      recipients: { type: 'json', defaultRaw: "'[]'" },
      minSeverity: { fieldName: 'min_severity', type: 'string', length: 16, defaultRaw: "'high'" },
      updatedAt: { fieldName: 'updated_at', type: 'datetime', onUpdate: () => new Date(), defaultRaw: 'now()' },
      updatedBy: { fieldName: 'updated_by', type: 'string', length: 128, nullable: true },
    },
  });


/* ── Tenant Roles ───────────────────────────────────── */

export class TenantRoleRecord {
  id!: string;
  tenantId!: string;
  name!: string;
  description!: string | null;
  permissions!: unknown[];
  createdBy!: string;
  createdAt!: Date;
  updatedAt!: Date;
}

export const TenantRoleRecordSchema = new EntitySchema<TenantRoleRecord>({
  class: TenantRoleRecord,
  tableName: 'tenant_roles',
  properties: {
    id: { type: 'string', length: 64, primary: true },
    tenantId: { fieldName: 'tenant_id', type: 'string', length: 64 },
    name: { type: 'string', length: 80 },
    description: { type: 'string', length: 240, nullable: true },
    permissions: { type: 'json', defaultRaw: "'[]'" },
    createdBy: { fieldName: 'created_by', type: 'string', length: 64 },
    createdAt: { fieldName: 'created_at', type: 'datetime', defaultRaw: 'now()' },
    updatedAt: { fieldName: 'updated_at', type: 'datetime', onUpdate: () => new Date(), defaultRaw: 'now()' },
  },
});


/* ── Communication Rates ────────────────────────────── */

export class CommunicationRateRecord {
  id!: string;
  channel!: string;
  unit!: string;
  rateKobo!: number;
  enabled!: boolean;
  description!: string;
  effectiveFrom!: Date;
  createdBy!: string | null;
  createdAt!: Date;
}

export const CommunicationRateRecordSchema = new EntitySchema<CommunicationRateRecord>({
  class: CommunicationRateRecord,
  tableName: 'communication_rates',
  properties: {
    id: { type: 'string', primary: true },
    channel: { type: 'string', length: 32, index: true },
    unit: { type: 'string', length: 32 },
    rateKobo: { fieldName: 'rate_kobo', type: 'bigint' },
    enabled: { type: 'boolean', defaultRaw: 'true' },
    description: { type: 'string', length: 255, defaultRaw: "''" },
    effectiveFrom: { fieldName: 'effective_from', type: 'datetime', defaultRaw: 'now()' },
    createdBy: { fieldName: 'created_by', type: 'string', length: 128, nullable: true },
    createdAt: { fieldName: 'created_at', type: 'datetime', defaultRaw: 'now()' },
  },
});


/* ── Plan Entitlements ──────────────────────────────── */

export class PlanEntitlementRecord {
  planCode!: string;
  paymentModel!: string;
  inheritsFromCode!: string | null;
  quotas!: Record<string, unknown>;
  limitBehaviour!: Record<string, unknown>;
  features!: unknown[];
  allowances!: unknown[];
  availableFor!: unknown[];
  trialDays!: number;
  updatedAt!: Date;
  updatedBy!: string | null;
}

export const PlanEntitlementRecordSchema = new EntitySchema<PlanEntitlementRecord>({
  class: PlanEntitlementRecord,
  tableName: 'plan_entitlements',
  properties: {
    planCode: { fieldName: 'plan_code', type: 'string', length: 80, primary: true },
    paymentModel: { fieldName: 'payment_model', type: 'string', length: 16, defaultRaw: "'prepaid'" },
    inheritsFromCode: { fieldName: 'inherits_from_code', type: 'string', length: 80, nullable: true },
    quotas: { type: 'json', defaultRaw: "'{}'" },
    limitBehaviour: { fieldName: 'limit_behaviour', type: 'json', defaultRaw: "'{}'" },
    features: { type: 'json', defaultRaw: "'[]'" },
    allowances: { type: 'json', defaultRaw: "'[]'" },
    availableFor: { fieldName: 'available_for', type: 'json', defaultRaw: "'[]'" },
    trialDays: { fieldName: 'trial_days', type: 'number', defaultRaw: '0' },
    updatedAt: { fieldName: 'updated_at', type: 'datetime', onUpdate: () => new Date(), defaultRaw: 'now()' },
    updatedBy: { fieldName: 'updated_by', type: 'string', length: 128, nullable: true },
  },
});

export class TenantUsageAllowanceRecord {
  tenantId!: string;
  item!: string;
  billingMonth!: string;
  used!: number;
  updatedAt!: Date;
}

export const TenantUsageAllowanceRecordSchema = new EntitySchema<TenantUsageAllowanceRecord>({
  class: TenantUsageAllowanceRecord,
  tableName: 'tenant_usage_allowance',
  properties: {
    tenantId: { fieldName: 'tenant_id', type: 'string', length: 64, primary: true },
    item: { type: 'string', length: 32, primary: true },
    billingMonth: { fieldName: 'billing_month', type: 'string', length: 7, primary: true },
    used: { type: 'bigint', defaultRaw: '0' },
    updatedAt: { fieldName: 'updated_at', type: 'datetime', onUpdate: () => new Date(), defaultRaw: 'now()' },
  },
});


/* ── Tenant Storage Usage ───────────────────────────── */

export class TenantStorageUsageRecord {
  tenantId!: string;
  source!: string;
  bytesUsed!: number;
  reconciledAt!: Date | null;
  updatedAt!: Date;
}

export const TenantStorageUsageRecordSchema = new EntitySchema<TenantStorageUsageRecord>({
  class: TenantStorageUsageRecord,
  tableName: 'tenant_storage_usage',
  properties: {
    tenantId: { fieldName: 'tenant_id', type: 'string', length: 64, primary: true },
    source: { type: 'string', length: 32, primary: true },
    bytesUsed: { fieldName: 'bytes_used', type: 'bigint', defaultRaw: '0' },
    reconciledAt: { fieldName: 'reconciled_at', type: 'datetime', nullable: true },
    updatedAt: { fieldName: 'updated_at', type: 'datetime', onUpdate: () => new Date(), defaultRaw: 'now()' },
  },
});


/* ── Organisation Upgrade Requests ──────────────────── */

export class OrganisationUpgradeRequestRecord {
  id!: string;
  tenantId!: string;
  fromOrganisationType!: string;
  toOrganisationType!: string;
  reason!: string;
  statedVehicleCount!: number;
  status!: string;
  requestedBy!: string;
  requestedAt!: Date;
  reviewedBy!: string | null;
  reviewedAt!: Date | null;
  reviewerNotes!: string | null;
  vehicleCountAtReview!: number | null;
  targetPlanCode!: string | null;
}

export const OrganisationUpgradeRequestRecordSchema =
  new EntitySchema<OrganisationUpgradeRequestRecord>({
    class: OrganisationUpgradeRequestRecord,
    tableName: 'organisation_upgrade_requests',
    properties: {
      id: { type: 'string', primary: true },
      tenantId: { fieldName: 'tenant_id', type: 'string', length: 64, index: true },
      fromOrganisationType: { fieldName: 'from_organisation_type', type: 'string', length: 32 },
      toOrganisationType: { fieldName: 'to_organisation_type', type: 'string', length: 32 },
      reason: { type: 'text' },
      statedVehicleCount: { fieldName: 'stated_vehicle_count', type: 'number', defaultRaw: '0' },
      status: { type: 'string', length: 16, defaultRaw: "'pending'" },
      requestedBy: { fieldName: 'requested_by', type: 'string', length: 128 },
      requestedAt: { fieldName: 'requested_at', type: 'datetime', defaultRaw: 'now()' },
      reviewedBy: { fieldName: 'reviewed_by', type: 'string', length: 128, nullable: true },
      reviewedAt: { fieldName: 'reviewed_at', type: 'datetime', nullable: true },
      reviewerNotes: { fieldName: 'reviewer_notes', type: 'text', nullable: true },
      vehicleCountAtReview: { fieldName: 'vehicle_count_at_review', type: 'number', nullable: true },
      targetPlanCode: { fieldName: 'target_plan_code', type: 'string', length: 32, nullable: true },
    },
  });

/* ── System Tenant Onboarding ───────────────────────── */

export class SystemTenantOnboardingRecord {
  id!: string;
  tenantId!: string;
  invitedEmail!: string;
  organizationType!: string;
  bootstrapRole!: string;
  status!: string;
  company!: Record<string, unknown>;
  subscription!: Record<string, unknown>;
  deviceProvisioning!: Record<string, unknown>;
  simAssignment!: Record<string, unknown>;
  features!: Record<string, unknown>;
  createdByUserId!: string;
  onboardingCompletedAt!: Date | null;
  paymentReference!: string | null;
  subscriptionActivatedAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export const SystemTenantOnboardingRecordSchema =
  new EntitySchema<SystemTenantOnboardingRecord>({
    class: SystemTenantOnboardingRecord,
    tableName: 'system_tenant_onboardings',
    properties: {
      id: { type: 'string', primary: true },
      tenantId: {
        fieldName: 'tenant_id',
        type: 'string',
        length: 64,
        unique: true,
        index: true,
      },
      invitedEmail: {
        fieldName: 'invited_email',
        type: 'string',
        length: 255,
        index: true,
      },
      organizationType: {
        fieldName: 'organization_type',
        type: 'string',
        length: 64,
      },
      bootstrapRole: {
        fieldName: 'bootstrap_role',
        type: 'string',
        length: 64,
      },
      status: { type: 'string', length: 32, default: 'pending_activation' },
      company: { type: 'json' },
      subscription: { type: 'json' },
      deviceProvisioning: { fieldName: 'device_provisioning', type: 'json' },
      simAssignment: { fieldName: 'sim_assignment', type: 'json' },
      features: { type: 'json' },
      createdByUserId: {
        fieldName: 'created_by_user_id',
        type: 'string',
        length: 64,
      },
      onboardingCompletedAt: {
        fieldName: 'onboarding_completed_at',
        type: 'datetime',
        nullable: true,
      },
      paymentReference: {
        fieldName: 'payment_reference',
        type: 'string',
        length: 255,
        nullable: true,
      },
      subscriptionActivatedAt: {
        fieldName: 'subscription_activated_at',
        type: 'datetime',
        nullable: true,
      },
      createdAt: {
        fieldName: 'created_at',
        type: 'datetime',
        defaultRaw: 'now()',
      },
      updatedAt: {
        fieldName: 'updated_at',
        type: 'datetime',
        defaultRaw: 'now()',
      },
    },
  });

/* ── Tenant Business Info ───────────────────────────── */

export class TenantBusinessInfoRecord {
  tenantId!: string;
  companyName!: string;
  registrationNumber!: string | null;
  taxId!: string | null;
  businessType!: string | null;
  industry!: string | null;
  addressLine1!: string | null;
  addressLine2!: string | null;
  city!: string | null;
  state!: string | null;
  postalCode!: string | null;
  country!: string | null;
  phone!: string | null;
  email!: string | null;
  billingEmail!: string | null;
  website!: string | null;
  yearEstablished!: number | null;
  numberOfEmployees!: number | null;
  verificationStatus!: string;
  verifiedAt!: Date | null;
  updatedAt!: Date;
}

export const TenantBusinessInfoRecordSchema =
  new EntitySchema<TenantBusinessInfoRecord>({
    class: TenantBusinessInfoRecord,
    tableName: 'tenant_business_info',
    properties: {
      tenantId: { fieldName: 'tenant_id', type: 'string', length: 64, primary: true },
      companyName: { fieldName: 'company_name', type: 'string', length: 255 },
      registrationNumber: { fieldName: 'registration_number', type: 'string', length: 128, nullable: true },
      taxId: { fieldName: 'tax_id', type: 'string', length: 128, nullable: true },
      businessType: { fieldName: 'business_type', type: 'string', length: 64, nullable: true },
      industry: { type: 'string', length: 128, nullable: true },
      addressLine1: { fieldName: 'address_line1', type: 'string', length: 255, nullable: true },
      addressLine2: { fieldName: 'address_line2', type: 'string', length: 255, nullable: true },
      city: { type: 'string', length: 128, nullable: true },
      state: { type: 'string', length: 128, nullable: true },
      postalCode: { fieldName: 'postal_code', type: 'string', length: 32, nullable: true },
      country: { type: 'string', length: 64, nullable: true },
      phone: { type: 'string', length: 32, nullable: true },
      email: { type: 'string', length: 255, nullable: true },
      billingEmail: { fieldName: 'billing_email', type: 'string', length: 255, nullable: true },
      website: { type: 'string', length: 255, nullable: true },
      yearEstablished: { fieldName: 'year_established', type: 'number', nullable: true },
      numberOfEmployees: { fieldName: 'number_of_employees', type: 'number', nullable: true },
      verificationStatus: { fieldName: 'verification_status', type: 'string', length: 32, default: 'pending' },
      verifiedAt: { fieldName: 'verified_at', type: 'datetime', nullable: true },
      updatedAt: { fieldName: 'updated_at', type: 'datetime', onUpdate: () => new Date(), defaultRaw: 'now()' },
    },
  });

/* ── Tenant KYC Documents ───────────────────────────── */

export class TenantKycDocumentRecord {
  id!: string;
  tenantId!: string;
  documentType!: string;
  documentName!: string;
  fileKey!: string;
  fileSize!: number;
  status!: string;
  reviewedBy!: string | null;
  reviewedAt!: Date | null;
  rejectionReason!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export const TenantKycDocumentRecordSchema =
  new EntitySchema<TenantKycDocumentRecord>({
    class: TenantKycDocumentRecord,
    tableName: 'tenant_kyc_documents',
    properties: {
      id: { type: 'string', primary: true },
      tenantId: { fieldName: 'tenant_id', type: 'string', length: 64, index: true },
      documentType: { fieldName: 'document_type', type: 'string', length: 64 },
      documentName: { fieldName: 'document_name', type: 'string', length: 255 },
      fileKey: { fieldName: 'file_key', type: 'string', length: 512 },
      fileSize: { fieldName: 'file_size', type: 'number', default: 0 },
      status: { type: 'string', length: 32, default: 'pending', index: true },
      reviewedBy: { fieldName: 'reviewed_by', type: 'string', length: 64, nullable: true },
      reviewedAt: { fieldName: 'reviewed_at', type: 'datetime', nullable: true },
      rejectionReason: { fieldName: 'rejection_reason', type: 'string', length: 1000, nullable: true },
      createdAt: { fieldName: 'created_at', type: 'datetime', defaultRaw: 'now()' },
      updatedAt: { fieldName: 'updated_at', type: 'datetime', onUpdate: () => new Date(), defaultRaw: 'now()' },
    },
  });

/* ── System Device Catalog ──────────────────────────── */

export class SystemDeviceModelRecord {
  id!: string;
  manufacturer!: string;
  model!: string;
  protocolType!: string;
  defaultPort!: number | null;
  supportedFeatures!: string[];
  status!: string;
  configurationInstructions!: string | null;
  smsCommands!: string[];
  wiringNotes!: string | null;
  diagramUrls!: string[];
  createdByUserId!: string;
  createdAt!: Date;
  updatedAt!: Date;
}

export const SystemDeviceModelRecordSchema =
  new EntitySchema<SystemDeviceModelRecord>({
    class: SystemDeviceModelRecord,
    tableName: 'system_device_models',
    properties: {
      id: { type: 'string', primary: true },
      manufacturer: { type: 'string', length: 120 },
      model: { type: 'string', length: 120 },
      protocolType: { fieldName: 'protocol_type', type: 'string', length: 16 },
      defaultPort: {
        fieldName: 'default_port',
        type: 'number',
        nullable: true,
      },
      supportedFeatures: {
        fieldName: 'supported_features',
        type: 'json',
        defaultRaw: "'[]'",
      },
      status: { type: 'string', length: 32, default: 'supported' },
      configurationInstructions: {
        fieldName: 'configuration_instructions',
        type: 'text',
        nullable: true,
      },
      smsCommands: {
        fieldName: 'sms_commands',
        type: 'json',
        defaultRaw: "'[]'",
      },
      wiringNotes: { fieldName: 'wiring_notes', type: 'text', nullable: true },
      diagramUrls: {
        fieldName: 'diagram_urls',
        type: 'json',
        defaultRaw: "'[]'",
      },
      createdByUserId: {
        fieldName: 'created_by_user_id',
        type: 'string',
        length: 64,
      },
      createdAt: {
        fieldName: 'created_at',
        type: 'datetime',
        defaultRaw: 'now()',
      },
      updatedAt: {
        fieldName: 'updated_at',
        type: 'datetime',
        onUpdate: () => new Date(),
        defaultRaw: 'now()',
      },
    },
    indexes: [
      { properties: ['manufacturer'] },
      { properties: ['status'] },
      { properties: ['createdAt'] },
      { properties: ['updatedAt'] },
    ],
    uniques: [{ properties: ['manufacturer', 'model'] }],
  });

/* ── System Subscription Plans ───────────────────────── */

export class SystemSubscriptionPlanRecord {
  id!: string;
  code!: string;
  tier!: string;
  name!: string;
  description!: string;
  monthlyPriceNgn!: number | null;
  yearlyMonthlyEquivalentNgn!: number | null;
  yearlyDiscountPercent!: number | null;
  maxActiveVehicles!: number | null;
  maxUsers!: number | null;
  customPricing!: boolean;
  trialDays!: number | null;
  badge!: string | null;
  ctaLabel!: string;
  features!: string[];
  isActive!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
}

export const SystemSubscriptionPlanRecordSchema =
  new EntitySchema<SystemSubscriptionPlanRecord>({
    class: SystemSubscriptionPlanRecord,
    tableName: 'system_subscription_plans',
    properties: {
      id: { type: 'string', primary: true },
      code: { type: 'string', length: 80, unique: true },
      tier: { type: 'string', length: 32 },
      name: { type: 'string', length: 120 },
      description: { type: 'string', length: 255 },
      monthlyPriceNgn: {
        fieldName: 'monthly_price_ngn',
        type: 'number',
        nullable: true,
      },
      yearlyMonthlyEquivalentNgn: {
        fieldName: 'yearly_monthly_equivalent_ngn',
        type: 'number',
        nullable: true,
      },
      yearlyDiscountPercent: {
        fieldName: 'yearly_discount_percent',
        type: 'number',
        nullable: true,
      },
      maxActiveVehicles: {
        fieldName: 'max_active_vehicles',
        type: 'number',
        nullable: true,
      },
      maxUsers: {
        fieldName: 'max_users',
        type: 'number',
        nullable: true,
      },
      customPricing: {
        fieldName: 'custom_pricing',
        type: 'boolean',
        default: false,
      },
      trialDays: { fieldName: 'trial_days', type: 'number', nullable: true },
      badge: { type: 'string', length: 64, nullable: true },
      ctaLabel: { fieldName: 'cta_label', type: 'string', length: 120 },
      features: { type: 'json', defaultRaw: "'[]'" },
      isActive: { fieldName: 'is_active', type: 'boolean', default: true },
      createdAt: {
        fieldName: 'created_at',
        type: 'datetime',
        defaultRaw: 'now()',
      },
      updatedAt: {
        fieldName: 'updated_at',
        type: 'datetime',
        onUpdate: () => new Date(),
        defaultRaw: 'now()',
      },
    },
    indexes: [{ properties: ['tier'] }, { properties: ['isActive'] }],
  });

export class PlatformIntegrationCredentialRecord {
  serviceKey!: string;
  category!: string;
  enabled!: boolean;
  secretCiphertext!: string | null;
  secretPreview!: string | null;
  config!: Record<string, unknown>;
  status!: string;
  lastTestedAt!: Date | null;
  lastError!: string | null;
  updatedAt!: Date;
}

export const PlatformIntegrationCredentialRecordSchema = new EntitySchema<PlatformIntegrationCredentialRecord>({
  class: PlatformIntegrationCredentialRecord,
  tableName: 'platform_integration_credentials',
  properties: {
    serviceKey: { fieldName: 'service_key', type: 'string', primary: true, length: 80 },
    category: { type: 'string', length: 64 },
    enabled: { type: 'boolean', default: true },
    secretCiphertext: { fieldName: 'secret_ciphertext', type: 'text', nullable: true },
    secretPreview: { fieldName: 'secret_preview', type: 'string', length: 32, nullable: true },
    config: { type: 'json', defaultRaw: "'{}'" },
    status: { type: 'string', length: 32 },
    lastTestedAt: { fieldName: 'last_tested_at', type: 'datetime', nullable: true },
    lastError: { fieldName: 'last_error', type: 'text', nullable: true },
    updatedAt: { fieldName: 'updated_at', type: 'datetime', defaultRaw: 'now()' },
  },
  indexes: [{ properties: ['category'] }, { properties: ['enabled'] }],
});

/* ── Invite ──────────────────────────────────────────── */

export class InviteRecord {
  id!: string;
  email!: string;
  roleId!: number;
  tenantId!: string;
  token!: string;
  invitedBy!: string;
  status!: string;
  expiresAt!: Date;
  createdAt!: Date;
}

export const InviteRecordSchema = new EntitySchema<InviteRecord>({
  class: InviteRecord,
  tableName: 'auth_invites',
  properties: {
    id: { type: 'string', primary: true },
    email: { type: 'string', length: 255 },
    roleId: { type: 'number' },
    tenantId: { type: 'string', length: 64 },
    token: { type: 'string', length: 255, unique: true },
    invitedBy: { type: 'string', length: 64 },
    status: { type: 'string', length: 20, default: 'pending' },
    expiresAt: { type: 'datetime' },
    createdAt: { type: 'datetime', defaultRaw: 'now()' },
  },
});

/* ── System Feature Flags ───────────────────────────── */

export class SystemFeatureFlagRecord {
  id!: string;
  scope!: string;
  tenantId!: string | null;
  featureKey!: string;
  featureName!: string;
  featureDescription!: string | null;
  isEnabled!: boolean;
  rolloutPercentage!: number;
  category!: string;
  phase!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export const SystemFeatureFlagRecordSchema =
  new EntitySchema<SystemFeatureFlagRecord>({
    class: SystemFeatureFlagRecord,
    tableName: 'system_feature_flags',
    properties: {
      id: { type: 'string', primary: true },
      scope: { type: 'string', length: 32, default: 'platform' },
      tenantId: {
        fieldName: 'tenant_id',
        type: 'string',
        length: 64,
        nullable: true,
      },
      featureKey: {
        fieldName: 'feature_key',
        type: 'string',
        length: 120,
        unique: true,
      },
      featureName: {
        fieldName: 'feature_name',
        type: 'string',
        length: 160,
      },
      featureDescription: {
        fieldName: 'feature_description',
        type: 'text',
        nullable: true,
      },
      isEnabled: {
        fieldName: 'is_enabled',
        type: 'boolean',
        default: false,
      },
      rolloutPercentage: {
        fieldName: 'rollout_percentage',
        type: 'number',
        default: 100,
      },
      category: { type: 'string', length: 64 },
      phase: { type: 'string', length: 32, nullable: true },
      createdAt: {
        fieldName: 'created_at',
        type: 'datetime',
        defaultRaw: 'now()',
      },
      updatedAt: {
        fieldName: 'updated_at',
        type: 'datetime',
        onUpdate: () => new Date(),
        defaultRaw: 'now()',
      },
    },
    indexes: [
      { properties: ['scope'] },
      { properties: ['category'] },
      { properties: ['phase'] },
    ],
  });

/* ── IoT SIMs ──────────────────────────────────────── */

export class IotSimRecord {
  id!: string;
  iccid!: string;
  imsi!: string | null;
  msisdn!: string | null;
  carrier!: string;
  plan!: string;
  status!: string;
  tenantId!: string | null;
  deviceId!: string | null;
  deviceName!: string | null;
  deviceImei!: string | null;
  deviceType!: string | null;
  vehicleId!: string | null;
  suspensionReason!: string | null;
  notes!: string | null;
  dataUsageMb!: number;
  dataLimitMb!: number;
  smsUsage!: number;
  smsLimit!: number;
  monthlyCostNgn!: number;
  activationDate!: Date | null;
  expiryDate!: Date | null;
  lastActivity!: Date | null;
  signalStrength!: number | null;
  networkType!: string | null;
  roaming!: boolean;
  fonuSimId!: string | null;
  fonuStatus!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export const IotSimRecordSchema = new EntitySchema<IotSimRecord>({
  class: IotSimRecord,
  tableName: 'iot_sims',
  properties: {
    id: { type: 'string', primary: true },
    iccid: { type: 'string', length: 32, unique: true },
    imsi: { type: 'string', length: 32, nullable: true },
    msisdn: { type: 'string', length: 32, nullable: true },
    carrier: { type: 'string', length: 64 },
    plan: { type: 'string', length: 32, default: 'iot_basic' },
    status: { type: 'string', length: 16, default: 'registered' },
    tenantId: { fieldName: 'tenant_id', type: 'string', length: 64, nullable: true, index: true },
    deviceId: { fieldName: 'device_id', type: 'string', length: 64, nullable: true },
    deviceName: { fieldName: 'device_name', type: 'string', length: 255, nullable: true },
    deviceImei: { fieldName: 'device_imei', type: 'string', length: 64, nullable: true },
    deviceType: { fieldName: 'device_type', type: 'string', length: 64, nullable: true },
    vehicleId: { fieldName: 'vehicle_id', type: 'string', length: 64, nullable: true },
    suspensionReason: { fieldName: 'suspension_reason', type: 'string', length: 255, nullable: true },
    notes: { type: 'text', nullable: true },
    dataUsageMb: { fieldName: 'data_usage_mb', type: 'number', columnType: 'numeric(12,2)', default: 0 },
    dataLimitMb: { fieldName: 'data_limit_mb', type: 'number', columnType: 'numeric(12,2)', default: 0 },
    smsUsage: { fieldName: 'sms_usage', type: 'number', default: 0 },
    smsLimit: { fieldName: 'sms_limit', type: 'number', default: 0 },
    monthlyCostNgn: { fieldName: 'monthly_cost_ngn', type: 'number', columnType: 'numeric(12,2)', default: 0 },
    activationDate: { fieldName: 'activation_date', type: 'datetime', nullable: true },
    expiryDate: { fieldName: 'expiry_date', type: 'datetime', nullable: true },
    lastActivity: { fieldName: 'last_activity', type: 'datetime', nullable: true },
    signalStrength: { fieldName: 'signal_strength', type: 'number', nullable: true },
    networkType: { fieldName: 'network_type', type: 'string', length: 16, nullable: true },
    roaming: { type: 'boolean', default: false },
    fonuSimId: { fieldName: 'fonu_sim_id', type: 'string', length: 128, nullable: true },
    fonuStatus: { fieldName: 'fonu_status', type: 'string', length: 32, nullable: true },
    createdAt: { fieldName: 'created_at', type: 'datetime', defaultRaw: 'now()' },
    updatedAt: { fieldName: 'updated_at', type: 'datetime', onUpdate: () => new Date(), defaultRaw: 'now()' },
  },
  indexes: [
    { properties: ['status'] },
    { properties: ['carrier'] },
  ],
});

/* ── SIM Provisioning Requests ─────────────────────── */

export class SimProvisioningRequestRecord {
  id!: string;
  tenantId!: string;
  tenantName!: string;
  requestType!: string;
  numberOfSims!: number;
  preferredOperator!: string;
  requestedPlan!: string;
  requestedDataLimitMb!: number;
  deploymentTimeline!: string | null;
  useCase!: string | null;
  deviceMappingData!: Record<string, unknown>[] | null;
  status!: string;
  approvedBy!: string | null;
  approvedByName!: string | null;
  approvedAt!: Date | null;
  rejectedReason!: string | null;
  fonuRequestId!: string | null;
  fonuResponse!: Record<string, unknown> | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export const SimProvisioningRequestRecordSchema =
  new EntitySchema<SimProvisioningRequestRecord>({
    class: SimProvisioningRequestRecord,
    tableName: 'sim_provisioning_requests',
    properties: {
      id: { type: 'string', primary: true },
      tenantId: { fieldName: 'tenant_id', type: 'string', length: 64, index: true },
      tenantName: { fieldName: 'tenant_name', type: 'string', length: 160 },
      requestType: { fieldName: 'request_type', type: 'string', length: 32, default: 'activation' },
      numberOfSims: { fieldName: 'number_of_sims', type: 'number' },
      preferredOperator: { fieldName: 'preferred_operator', type: 'string', length: 64 },
      requestedPlan: { fieldName: 'requested_plan', type: 'string', length: 32 },
      requestedDataLimitMb: { fieldName: 'requested_data_limit_mb', type: 'number' },
      deploymentTimeline: { fieldName: 'deployment_timeline', type: 'string', length: 32, nullable: true },
      useCase: { fieldName: 'use_case', type: 'text', nullable: true },
      deviceMappingData: { fieldName: 'device_mapping_data', type: 'json', nullable: true },
      status: { type: 'string', length: 16, default: 'pending', index: true },
      approvedBy: { fieldName: 'approved_by', type: 'string', length: 64, nullable: true },
      approvedByName: { fieldName: 'approved_by_name', type: 'string', length: 160, nullable: true },
      approvedAt: { fieldName: 'approved_at', type: 'datetime', nullable: true },
      rejectedReason: { fieldName: 'rejected_reason', type: 'text', nullable: true },
      fonuRequestId: { fieldName: 'fonu_request_id', type: 'string', length: 128, nullable: true },
      fonuResponse: { fieldName: 'fonu_response', type: 'json', nullable: true },
      createdAt: { fieldName: 'created_at', type: 'datetime', defaultRaw: 'now()', index: true },
      updatedAt: { fieldName: 'updated_at', type: 'datetime', onUpdate: () => new Date(), defaultRaw: 'now()' },
    },
  });

/* ── SIM Activation Batches ────────────────────────── */

export class SimActivationBatchRecord {
  id!: string;
  requestId!: string | null;
  tenantId!: string;
  tenantName!: string;
  activationMode!: string;
  quantity!: number;
  operator!: string;
  requestedPlan!: string;
  dataLimitGb!: number;
  deviceMappingData!: Record<string, unknown>[] | null;
  status!: string;
  simsActivated!: number;
  simsFailed!: number;
  fonuResponse!: Record<string, unknown> | null;
  createdBy!: string | null;
  createdByName!: string | null;
  startedAt!: Date | null;
  completedAt!: Date | null;
  errorMessage!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export const SimActivationBatchRecordSchema =
  new EntitySchema<SimActivationBatchRecord>({
    class: SimActivationBatchRecord,
    tableName: 'sim_activation_batches',
    properties: {
      id: { type: 'string', primary: true },
      requestId: { fieldName: 'request_id', type: 'string', length: 64, nullable: true, index: true },
      tenantId: { fieldName: 'tenant_id', type: 'string', length: 64, index: true },
      tenantName: { fieldName: 'tenant_name', type: 'string', length: 160 },
      activationMode: { fieldName: 'activation_mode', type: 'string', length: 16, default: 'bulk' },
      quantity: { type: 'number' },
      operator: { type: 'string', length: 64 },
      requestedPlan: { fieldName: 'requested_plan', type: 'string', length: 32 },
      dataLimitGb: { fieldName: 'data_limit_gb', type: 'number', columnType: 'numeric(8,2)', default: 1 },
      deviceMappingData: { fieldName: 'device_mapping_data', type: 'json', nullable: true },
      status: { type: 'string', length: 32, default: 'pending', index: true },
      simsActivated: { fieldName: 'sims_activated', type: 'number', default: 0 },
      simsFailed: { fieldName: 'sims_failed', type: 'number', default: 0 },
      fonuResponse: { fieldName: 'fonu_response', type: 'json', nullable: true },
      createdBy: { fieldName: 'created_by', type: 'string', length: 64, nullable: true },
      createdByName: { fieldName: 'created_by_name', type: 'string', length: 160, nullable: true },
      startedAt: { fieldName: 'started_at', type: 'datetime', nullable: true },
      completedAt: { fieldName: 'completed_at', type: 'datetime', nullable: true },
      errorMessage: { fieldName: 'error_message', type: 'text', nullable: true },
      createdAt: { fieldName: 'created_at', type: 'datetime', defaultRaw: 'now()' },
      updatedAt: { fieldName: 'updated_at', type: 'datetime', onUpdate: () => new Date(), defaultRaw: 'now()' },
    },
  });

/* ── Password Reset ──────────────────────────────────── */

export class PasswordResetRecord {
  id!: string;
  userId!: string;
  token!: string;
  method!: string;
  code!: string | null;
  used!: boolean;
  expiresAt!: Date;
  createdAt!: Date;
}

export const PasswordResetRecordSchema = new EntitySchema<PasswordResetRecord>({
  class: PasswordResetRecord,
  tableName: 'auth_password_resets',
  properties: {
    id: { type: 'string', primary: true },
    userId: { type: 'string', length: 64 },
    token: { type: 'string', length: 255, unique: true },
    method: { type: 'string', length: 10 },
    code: { type: 'string', length: 10, nullable: true },
    used: { type: 'boolean', default: false },
    expiresAt: { type: 'datetime' },
    createdAt: { type: 'datetime', defaultRaw: 'now()' },
  },
});

/* ── ORM bootstrap ───────────────────────────────────── */

let ormPromise: Promise<MikroORM> | null = null;

export function mapRoleIdToName(roleId: number): string {
  return roleFromId(roleId);
}

export function mapRoleNameToId(role: string): number {
  return roleToId(role);
}

async function hasColumn(orm: MikroORM, tableName: string, columnName: string) {
  const connection = orm.em.getConnection();
  const rows = (await connection.execute(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${tableName}' AND column_name = '${columnName}'`,
  )) as Array<Record<string, unknown>>;
  return rows.length > 0;
}

async function backfillLegacyRoleColumns(orm: MikroORM) {
  const connection = orm.em.getConnection();

  if (
    (await hasColumn(orm, 'auth_users', 'roles')) &&
    (await hasColumn(orm, 'auth_users', 'role_id'))
  ) {
    const rows = (await connection.execute(
      'SELECT id, roles, role_id FROM auth_users',
    )) as Array<{
      id: string;
      roles: string | string[] | null;
      role_id: number | null;
    }>;

    for (const row of rows) {
      if (row.role_id || !row.roles) {
        continue;
      }
      const roles = Array.isArray(row.roles)
        ? row.roles
        : (JSON.parse(row.roles) as string[]);
      await connection.execute(
        `UPDATE auth_users SET role_id = ${mapRoleNameToId(roles[0])} WHERE id = '${row.id}'`,
      );
    }
  }

  if (
    (await hasColumn(orm, 'auth_sessions', 'roles')) &&
    (await hasColumn(orm, 'auth_sessions', 'role_id'))
  ) {
    const rows = (await connection.execute(
      'SELECT refresh_token, roles, role_id FROM auth_sessions',
    )) as Array<{
      refresh_token: string;
      roles: string | string[] | null;
      role_id: number | null;
    }>;

    for (const row of rows) {
      if (row.role_id || !row.roles) {
        continue;
      }
      const roles = Array.isArray(row.roles)
        ? row.roles
        : (JSON.parse(row.roles) as string[]);
      await connection.execute(
        `UPDATE auth_sessions SET role_id = ${mapRoleNameToId(roles[0])} WHERE refresh_token = '${row.refresh_token}'`,
      );
    }
  }

  if (
    (await hasColumn(orm, 'auth_invites', 'role')) &&
    (await hasColumn(orm, 'auth_invites', 'role_id'))
  ) {
    const rows = (await connection.execute(
      'SELECT id, role, role_id FROM auth_invites',
    )) as Array<{ id: string; role: string | null; role_id: number | null }>;

    for (const row of rows) {
      if (row.role_id || !row.role) {
        continue;
      }
      await connection.execute(
        `UPDATE auth_invites SET role_id = ${roleToId(row.role)} WHERE id = '${row.id}'`,
      );
    }
  }
}

/* ── Support Tickets ──────────────────────────────────── */

export class SupportTicketRecord {
  id!: string;
  tenantId!: string;
  category!: string;
  subject!: string;
  description!: string;
  status!: string;
  priority!: string;
  channel!: string | null;
  otherChannel!: string | null;
  contextType!: string;
  contextId!: string | null;
  contextSnapshot!: Record<string, unknown> | null;
  escalatedTo!: string | null;
  escalatedReferenceId!: string | null;
  escalationNotes!: string | null;
  escalatedAt!: Date | null;
  escalatedBy!: string | null;
  assignedTo!: string | null;
  createdBy!: string;
  resolvedAt!: Date | null;
  closedAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export const SupportTicketRecordSchema = new EntitySchema<SupportTicketRecord>({
  class: SupportTicketRecord,
  tableName: 'support_tickets',
  properties: {
    id: { type: 'string', primary: true },
    tenantId: { type: 'string', length: 64, fieldName: 'tenant_id' },
    category: { type: 'string', length: 32, default: 'other' },
    subject: { type: 'string', length: 255 },
    description: { type: 'text' },
    status: { type: 'string', length: 32, default: 'open' },
    priority: { type: 'string', length: 16, default: 'medium' },
    channel: { type: 'string', length: 16, nullable: true, fieldName: 'channel' },
    otherChannel: { type: 'string', length: 255, nullable: true, fieldName: 'other_channel' },
    contextType: { type: 'string', length: 16, default: 'none', fieldName: 'context_type' },
    contextId: { type: 'string', length: 64, nullable: true, fieldName: 'context_id' },
    contextSnapshot: { type: 'json', nullable: true, fieldName: 'context_snapshot' },
    escalatedTo: { type: 'string', length: 32, nullable: true, fieldName: 'escalated_to' },
    escalatedReferenceId: { type: 'string', length: 128, nullable: true, fieldName: 'escalated_reference_id' },
    escalationNotes: { type: 'text', nullable: true, fieldName: 'escalation_notes' },
    escalatedAt: { type: 'datetime', nullable: true, fieldName: 'escalated_at' },
    escalatedBy: { type: 'string', length: 64, nullable: true, fieldName: 'escalated_by' },
    assignedTo: { type: 'string', length: 64, nullable: true, fieldName: 'assigned_to' },
    createdBy: { type: 'string', length: 64, fieldName: 'created_by' },
    resolvedAt: { type: 'datetime', nullable: true, fieldName: 'resolved_at' },
    closedAt: { type: 'datetime', nullable: true, fieldName: 'closed_at' },
    createdAt: { type: 'datetime', defaultRaw: 'now()', fieldName: 'created_at' },
    updatedAt: { type: 'datetime', defaultRaw: 'now()', onUpdate: () => new Date(), fieldName: 'updated_at' },
  },
});

/* ── Support Messages ─────────────────────────────────── */

export class SupportMessageRecord {
  id!: string;
  ticketId!: string;
  senderId!: string;
  senderName!: string | null;
  senderRole!: string;
  message!: string;
  isInternal!: boolean;
  createdAt!: Date;
}

export const SupportMessageRecordSchema = new EntitySchema<SupportMessageRecord>({
  class: SupportMessageRecord,
  tableName: 'support_messages',
  properties: {
    id: { type: 'string', primary: true },
    ticketId: { type: 'string', length: 64, fieldName: 'ticket_id' },
    senderId: { type: 'string', length: 64, fieldName: 'sender_id' },
    senderName: { type: 'string', length: 160, nullable: true, fieldName: 'sender_name' },
    senderRole: { type: 'string', length: 32, fieldName: 'sender_role' },
    message: { type: 'text' },
    isInternal: { type: 'boolean', default: false, fieldName: 'is_internal' },
    createdAt: { type: 'datetime', defaultRaw: 'now()', fieldName: 'created_at' },
  },
});

export class AuthEventRecord {
  id!: string;
  tenantId!: string | null;
  userId!: string | null;
  email!: string | null;
  eventType!: string;
  status!: string;
  failureReason!: string | null;
  ipAddress!: string;
  userAgent!: string | null;
  occurredAt!: Date;
}

export const AuthEventRecordSchema = new EntitySchema<AuthEventRecord>({
  class: AuthEventRecord,
  tableName: 'auth_events',
  properties: {
    id: { type: 'string', primary: true },
    tenantId: { type: 'string', length: 64, nullable: true, fieldName: 'tenant_id' },
    userId: { type: 'string', length: 64, nullable: true, fieldName: 'user_id' },
    email: { type: 'string', length: 255, nullable: true },
    eventType: { type: 'string', length: 16, fieldName: 'event_type' },
    status: { type: 'string', length: 16 },
    failureReason: { type: 'string', length: 32, nullable: true, fieldName: 'failure_reason' },
    ipAddress: { type: 'string', length: 64, fieldName: 'ip_address' },
    userAgent: { type: 'text', nullable: true, fieldName: 'user_agent' },
    occurredAt: { type: 'datetime', defaultRaw: 'now()', fieldName: 'occurred_at' },
  },
});

export class BlockedIpRecord {
  id!: string;
  ipAddress!: string;
  reason!: string;
  blockType!: string;
  blockedAt!: Date;
  expiresAt!: Date | null;
  blockedBy!: string;
  unblockedAt!: Date | null;
  unblockedBy!: string | null;
}

export const BlockedIpRecordSchema = new EntitySchema<BlockedIpRecord>({
  class: BlockedIpRecord,
  tableName: 'blocked_ips',
  properties: {
    id: { type: 'string', primary: true },
    ipAddress: { type: 'string', length: 64, fieldName: 'ip_address' },
    reason: { type: 'text' },
    blockType: { type: 'string', length: 16, fieldName: 'block_type' },
    blockedAt: { type: 'datetime', defaultRaw: 'now()', fieldName: 'blocked_at' },
    expiresAt: { type: 'datetime', nullable: true, fieldName: 'expires_at' },
    blockedBy: { type: 'string', length: 64, fieldName: 'blocked_by' },
    unblockedAt: { type: 'datetime', nullable: true, fieldName: 'unblocked_at' },
    unblockedBy: { type: 'string', length: 64, nullable: true, fieldName: 'unblocked_by' },
  },
});

export class AutoBlockRuleRecord {
  id!: string;
  name!: string;
  enabled!: boolean;
  maxAttempts!: number;
  windowMinutes!: number;
  blockDurationHours!: number | null;
  precedence!: number;
  updatedAt!: Date;
  updatedBy!: string | null;
}

export const AutoBlockRuleRecordSchema = new EntitySchema<AutoBlockRuleRecord>({
  class: AutoBlockRuleRecord,
  tableName: 'auto_block_rules',
  properties: {
    id: { type: 'string', primary: true },
    name: { type: 'string', length: 64 },
    enabled: { type: 'boolean', default: true },
    maxAttempts: { type: 'integer', fieldName: 'max_attempts' },
    windowMinutes: { type: 'integer', fieldName: 'window_minutes' },
    blockDurationHours: { type: 'integer', nullable: true, fieldName: 'block_duration_hours' },
    precedence: { type: 'integer' },
    updatedAt: { type: 'datetime', defaultRaw: 'now()', fieldName: 'updated_at' },
    updatedBy: { type: 'string', length: 64, nullable: true, fieldName: 'updated_by' },
  },
});

export class SecurityEventRecord {
  id!: string;
  eventType!: string;
  severity!: string;
  tenantId!: string | null;
  summary!: string;
  relatedEntityType!: string | null;
  relatedEntityId!: string | null;
  metadata!: Record<string, unknown>;
  occurredAt!: Date;
}

export const SecurityEventRecordSchema = new EntitySchema<SecurityEventRecord>({
  class: SecurityEventRecord,
  tableName: 'security_events',
  properties: {
    id: { type: 'string', primary: true },
    eventType: { type: 'string', length: 32, fieldName: 'event_type' },
    severity: { type: 'string', length: 16 },
    tenantId: { type: 'string', length: 64, nullable: true, fieldName: 'tenant_id' },
    summary: { type: 'text' },
    relatedEntityType: { type: 'string', length: 32, nullable: true, fieldName: 'related_entity_type' },
    relatedEntityId: { type: 'string', length: 64, nullable: true, fieldName: 'related_entity_id' },
    metadata: { type: 'json', defaultRaw: "'{}'" },
    occurredAt: { type: 'datetime', defaultRaw: 'now()', fieldName: 'occurred_at' },
  },
  indexes: [{ properties: ['severity', 'occurredAt'] }],
});

export class SupportTicketAttachmentRecord {
  id!: string;
  ticketId!: string;
  tenantId!: string;
  messageId!: string | null;
  key!: string;
  filename!: string;
  contentType!: string;
  sizeBytes!: number;
  uploadedBy!: string;
  createdAt!: Date;
}

export const SupportTicketAttachmentRecordSchema = new EntitySchema<SupportTicketAttachmentRecord>({
  class: SupportTicketAttachmentRecord,
  tableName: 'support_ticket_attachments',
  properties: {
    id: { type: 'string', primary: true },
    ticketId: { type: 'string', length: 64, fieldName: 'ticket_id' },
    tenantId: { type: 'string', length: 64, fieldName: 'tenant_id' },
    messageId: { type: 'string', length: 64, nullable: true, fieldName: 'message_id' },
    key: { type: 'string', length: 512 },
    filename: { type: 'string', length: 255 },
    contentType: { type: 'string', length: 128, fieldName: 'content_type' },
    sizeBytes: { type: 'bigint', fieldName: 'size_bytes' },
    uploadedBy: { type: 'string', length: 64, fieldName: 'uploaded_by' },
    createdAt: { type: 'datetime', defaultRaw: 'now()', fieldName: 'created_at' },
  },
});

/* ── Bundle Carriers ────────────────────────────────── */

export class BundleCarrierRecord {
  id!: string;
  name!: string;
  displayName!: string;
  active!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
}

export const BundleCarrierRecordSchema = new EntitySchema<BundleCarrierRecord>({
  class: BundleCarrierRecord,
  tableName: 'bundle_carriers',
  properties: {
    id: { type: 'string', length: 64, primary: true },
    name: { type: 'string', length: 128 },
    displayName: { fieldName: 'display_name', type: 'string', length: 128 },
    active: { type: 'boolean', default: true },
    createdAt: { fieldName: 'created_at', type: 'datetime', defaultRaw: 'now()' },
    updatedAt: { fieldName: 'updated_at', type: 'datetime', onUpdate: () => new Date(), defaultRaw: 'now()' },
  },
});

/* ── Bundle Catalog ─────────────────────────────────── */

export class BundleCatalogRecord {
  id!: string;
  code!: string;
  name!: string;
  carrierId!: string;
  dataAmountGb!: number;
  validityDays!: number;
  billingCycle!: string;
  priceKobo!: number;
  currency!: string;
  active!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
}

export const BundleCatalogRecordSchema = new EntitySchema<BundleCatalogRecord>({
  class: BundleCatalogRecord,
  tableName: 'bundle_catalog',
  properties: {
    id: { type: 'string', length: 255, primary: true },
    code: { type: 'string', length: 128, unique: true },
    name: { type: 'string', length: 255 },
    carrierId: { fieldName: 'carrier_id', type: 'string', length: 64, index: true },
    dataAmountGb: { fieldName: 'data_amount_gb', type: 'number', columnType: 'numeric(8,2)', default: 0 },
    validityDays: { fieldName: 'validity_days', type: 'number', default: 30 },
    billingCycle: { fieldName: 'billing_cycle', type: 'string', length: 16, default: 'monthly' },
    priceKobo: { fieldName: 'price_kobo', type: 'bigint', default: 0 },
    currency: { type: 'string', length: 8, default: 'NGN' },
    active: { type: 'boolean', default: true },
    createdAt: { fieldName: 'created_at', type: 'datetime', defaultRaw: 'now()' },
    updatedAt: { fieldName: 'updated_at', type: 'datetime', onUpdate: () => new Date(), defaultRaw: 'now()' },
  },
});

/* ── Tenant Wallets ─────────────────────────────────── */

export class TenantWalletRecord {
  tenantId!: string;
  balanceKobo!: number;
  currency!: string;
  creditEnabled!: boolean;
  creditLimitKobo?: number | null;
  lowBalanceThresholdKobo!: number;
  updatedAt!: Date;
}

export const TenantWalletRecordSchema = new EntitySchema<TenantWalletRecord>({
  class: TenantWalletRecord,
  tableName: 'tenant_wallets',
  properties: {
    tenantId: { fieldName: 'tenant_id', type: 'string', length: 64, primary: true },
    balanceKobo: { fieldName: 'balance_kobo', type: 'bigint', default: 0 },
    currency: { type: 'string', length: 8, default: 'NGN' },
    creditEnabled: { fieldName: 'credit_enabled', type: 'boolean', default: false },
    // Null means unlimited, never zero. Zero is a real setting meaning no
    // headroom at all.
    creditLimitKobo: { fieldName: 'credit_limit_kobo', type: 'bigint', nullable: true },
    lowBalanceThresholdKobo: {
      fieldName: 'low_balance_threshold_kobo',
      type: 'bigint',
      default: 0,
    },
    updatedAt: { fieldName: 'updated_at', type: 'datetime', onUpdate: () => new Date(), defaultRaw: 'now()' },
  },
});

/* ── Wallet Top-Ups ─────────────────────────────────── */

export class WalletTopUpRecord {
  id!: string;
  tenantId!: string;
  amountKobo!: number;
  provider!: string;
  mobileNumber!: string;
  status!: string;
  reference!: string | null;
  settledAt!: Date | null;
  createdAt!: Date;
}

export const WalletTopUpRecordSchema = new EntitySchema<WalletTopUpRecord>({
  class: WalletTopUpRecord,
  tableName: 'wallet_top_ups',
  properties: {
    id: { type: 'string', primary: true },
    tenantId: { fieldName: 'tenant_id', type: 'string', length: 64, index: true },
    amountKobo: { fieldName: 'amount_kobo', type: 'bigint' },
    provider: { type: 'string', length: 64 },
    mobileNumber: { fieldName: 'mobile_number', type: 'string', length: 32 },
    status: { type: 'string', length: 32, default: 'pending' },
    reference: { type: 'string', length: 255, nullable: true },
    settledAt: { fieldName: 'settled_at', type: 'datetime', nullable: true },
    createdAt: { fieldName: 'created_at', type: 'datetime', defaultRaw: 'now()' },
  },
});

/* ── Wallet Ledger ──────────────────────────────────── */

export class WalletLedgerEntryRecord {
  id!: string;
  seq!: number;
  tenantId!: string;
  direction!: string;
  category!: string;
  amountKobo!: number;
  balanceAfterKobo!: number;
  unitRateKobo!: number;
  quantity!: number;
  reason!: string;
  reference!: string | null;
  createdAt!: Date;
}

export const WalletLedgerEntryRecordSchema = new EntitySchema<WalletLedgerEntryRecord>({
  class: WalletLedgerEntryRecord,
  tableName: 'wallet_ledger_entries',
  properties: {
    id: { type: 'string', primary: true },
    seq: { type: 'bigint', autoincrement: true, nullable: true },
    tenantId: { fieldName: 'tenant_id', type: 'string', length: 64, index: true },
    direction: { type: 'string', length: 16 },
    category: { type: 'string', length: 32 },
    amountKobo: { fieldName: 'amount_kobo', type: 'bigint' },
    balanceAfterKobo: { fieldName: 'balance_after_kobo', type: 'bigint' },
    unitRateKobo: { fieldName: 'unit_rate_kobo', type: 'bigint', default: 0 },
    quantity: { type: 'number', default: 1 },
    reason: { type: 'string', length: 255 },
    reference: { type: 'string', length: 255, nullable: true },
    createdAt: { fieldName: 'created_at', type: 'datetime', defaultRaw: 'now()' },
  },
});

/* ── Spending Limit Settings ────────────────────────── */

export class SpendingLimitSettingsRecord {
  tenantId!: string;
  enabled!: boolean;
  monthlyLimitKobo!: number;
  spentThisMonthKobo!: number;
  resetDayOfMonth!: number;
  alertEmail!: string | null;
  notifyAtPercentages!: number[];
  windowStartedOn!: string | null;
  notifiedPercentages!: number[];
  updatedAt!: Date;
}

export const SpendingLimitSettingsRecordSchema = new EntitySchema<SpendingLimitSettingsRecord>({
  class: SpendingLimitSettingsRecord,
  tableName: 'spending_limit_settings',
  properties: {
    tenantId: { fieldName: 'tenant_id', type: 'string', length: 64, primary: true },
    enabled: { type: 'boolean', default: false },
    monthlyLimitKobo: { fieldName: 'monthly_limit_kobo', type: 'bigint', default: 0 },
    spentThisMonthKobo: { fieldName: 'spent_this_month_kobo', type: 'bigint', default: 0 },
    resetDayOfMonth: { fieldName: 'reset_day_of_month', type: 'number', default: 1 },
    alertEmail: { fieldName: 'alert_email', type: 'string', length: 255, nullable: true },
    notifyAtPercentages: { fieldName: 'notify_at_percentages', type: 'json' },
    windowStartedOn: { fieldName: 'window_started_on', type: 'string', length: 10, nullable: true },
    notifiedPercentages: { fieldName: 'notified_percentages', type: 'json' },
    updatedAt: { fieldName: 'updated_at', type: 'datetime', onUpdate: () => new Date(), defaultRaw: 'now()' },
  },
});

/* ── Auto Top-Up Settings ───────────────────────────── */

export class AutoTopUpSettingsRecord {
  tenantId!: string;
  enabled!: boolean;
  thresholdKobo!: number;
  topupAmountKobo!: number;
  paymentProvider!: string;
  mobileNumber!: string | null;
  updatedAt!: Date;
}

export const AutoTopUpSettingsRecordSchema = new EntitySchema<AutoTopUpSettingsRecord>({
  class: AutoTopUpSettingsRecord,
  tableName: 'auto_topup_settings',
  properties: {
    tenantId: { fieldName: 'tenant_id', type: 'string', length: 64, primary: true },
    enabled: { type: 'boolean', default: false },
    thresholdKobo: { fieldName: 'threshold_kobo', type: 'bigint', default: 0 },
    topupAmountKobo: { fieldName: 'topup_amount_kobo', type: 'bigint', default: 0 },
    paymentProvider: { fieldName: 'payment_provider', type: 'string', length: 64, default: 'MTN_MOMO' },
    mobileNumber: { fieldName: 'mobile_number', type: 'string', length: 32, nullable: true },
    updatedAt: { fieldName: 'updated_at', type: 'datetime', onUpdate: () => new Date(), defaultRaw: 'now()' },
  },
});

/* ── Bundle Allocations ─────────────────────────────── */

export class BundleAllocationRecord {
  id!: string;
  tenantId!: string;
  mobileNumber!: string;
  bundleId!: string;
  dataUsedMb!: number;
  dataTotalMb!: number;
  activatedAt!: Date | null;
  expiresAt!: Date | null;
  status!: string;
  createdAt!: Date;
  updatedAt!: Date;
}

export const BundleAllocationRecordSchema = new EntitySchema<BundleAllocationRecord>({
  class: BundleAllocationRecord,
  tableName: 'bundle_allocations',
  properties: {
    id: { type: 'string', primary: true },
    tenantId: { fieldName: 'tenant_id', type: 'string', length: 64, index: true },
    mobileNumber: { fieldName: 'mobile_number', type: 'string', length: 32 },
    bundleId: { fieldName: 'bundle_id', type: 'string', length: 255 },
    dataUsedMb: { fieldName: 'data_used_mb', type: 'number', columnType: 'numeric(12,2)', default: 0 },
    dataTotalMb: { fieldName: 'data_total_mb', type: 'number', columnType: 'numeric(12,2)', default: 0 },
    activatedAt: { fieldName: 'activated_at', type: 'datetime', nullable: true },
    expiresAt: { fieldName: 'expires_at', type: 'datetime', nullable: true },
    status: { type: 'string', length: 32, default: 'pending' },
    createdAt: { fieldName: 'created_at', type: 'datetime', defaultRaw: 'now()' },
    updatedAt: { fieldName: 'updated_at', type: 'datetime', onUpdate: () => new Date(), defaultRaw: 'now()' },
  },
});

/* ── Bundle Transactions ────────────────────────────── */

export class BundleTransactionRecord {
  id!: string;
  tenantId!: string;
  mobileNumber!: string;
  bundleId!: string;
  amountKobo!: number;
  status!: string;
  paymentReference!: string | null;
  failureReason!: string | null;
  createdAt!: Date;
}

export const BundleTransactionRecordSchema = new EntitySchema<BundleTransactionRecord>({
  class: BundleTransactionRecord,
  tableName: 'bundle_transactions',
  properties: {
    id: { type: 'string', primary: true },
    tenantId: { fieldName: 'tenant_id', type: 'string', length: 64, index: true },
    mobileNumber: { fieldName: 'mobile_number', type: 'string', length: 32 },
    bundleId: { fieldName: 'bundle_id', type: 'string', length: 255 },
    amountKobo: { fieldName: 'amount_kobo', type: 'bigint' },
    status: { type: 'string', length: 32, default: 'pending' },
    paymentReference: { fieldName: 'payment_reference', type: 'string', length: 255, nullable: true },
    failureReason: { fieldName: 'failure_reason', type: 'text', nullable: true },
    createdAt: { fieldName: 'created_at', type: 'datetime', defaultRaw: 'now()', index: true },
  },
});

/* ── Device Mapping Files ───────────────────────────── */

export class DeviceMappingFileRecord {
  id!: string;
  tenantId!: string;
  fileKey!: string;
  rowCount!: number;
  errors!: Array<{ row: number; field?: string; message: string }> | null;
  createdAt!: Date;
}

export const DeviceMappingFileRecordSchema = new EntitySchema<DeviceMappingFileRecord>({
  class: DeviceMappingFileRecord,
  tableName: 'device_mapping_files',
  properties: {
    id: { type: 'string', primary: true },
    tenantId: { fieldName: 'tenant_id', type: 'string', length: 64, index: true },
    fileKey: { fieldName: 'file_key', type: 'string', length: 512 },
    rowCount: { fieldName: 'row_count', type: 'number', default: 0 },
    errors: { type: 'json', nullable: true },
    createdAt: { fieldName: 'created_at', type: 'datetime', defaultRaw: 'now()' },
  },
});

export async function getAuthOrm(cfg: DbConfig) {
  if (ormPromise) {
    return ormPromise;
  }

  ormPromise = MikroORM.init({
    entities: [
      AuthRoleRecordSchema,
      OrganisationUpgradeRequestRecordSchema,
      TenantStorageUsageRecordSchema,
      PlanEntitlementRecordSchema,
      TenantUsageAllowanceRecordSchema,
      CommunicationRateRecordSchema,
      PlatformAlertSettingRecordSchema,
      TenantRoleRecordSchema,
      MailThreadRecordSchema,
      MailMessageRecordSchema,
      MailSyncStateRecordSchema,
      TenantMailCredentialRecordSchema,
      AuthSessionRecordSchema,
      AuthUserRecordSchema,
      InviteRecordSchema,
      PasswordResetRecordSchema,
      OrganizationSettingsRecordSchema,
      SystemSettingsRecordSchema,
      AiGovernanceRecordSchema,
      TwoFactorEnrolmentRecordSchema,
      TenantTerminationRecordSchema,
      AiRequestLogRecordSchema,
      ActivityLogRecordSchema,
      SystemTenantOnboardingRecordSchema,
      SystemDeviceModelRecordSchema,
      SystemSubscriptionPlanRecordSchema,
      SystemFeatureFlagRecordSchema,
      IotSimRecordSchema,
      SimProvisioningRequestRecordSchema,
      SimActivationBatchRecordSchema,
      SupportTicketRecordSchema,
      SupportMessageRecordSchema,
      SupportTicketAttachmentRecordSchema,
      AuthEventRecordSchema,
      BlockedIpRecordSchema,
      AutoBlockRuleRecordSchema,
      SecurityEventRecordSchema,
      TenantBusinessInfoRecordSchema,
      TenantKycDocumentRecordSchema,
      OnboardingApplicationRecordSchema,
      OnboardingIdentityClaimRecordSchema,
      OnboardingVerificationResultRecordSchema,
      OnboardingPaymentRecordSchema,
      InstallerRecordSchema,
      InstallationOrderRecordSchema,
      InstallationDeviceAssignmentRecordSchema,
      IndemnityTemplateRecordSchema,
      IndemnitySignatureRecordSchema,
      M2mLicensePlanRecordSchema,
      OnboardingApplicationVehicleRecordSchema,
      OnboardingDeviceRequestRecordSchema,
      OnboardingApplicationDocumentRecordSchema,
      OnboardingVerificationCodeRecordSchema,
      BundleCarrierRecordSchema,
      BundleCatalogRecordSchema,
      TenantWalletRecordSchema,
      WalletTopUpRecordSchema,
      WalletLedgerEntryRecordSchema,
      SpendingLimitSettingsRecordSchema,
      AutoTopUpSettingsRecordSchema,
      BundleAllocationRecordSchema,
      BundleTransactionRecordSchema,
      DeviceMappingFileRecordSchema,
    ],
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    dbName: cfg.dbName,
    pool: { min: cfg.poolMin ?? 2, max: cfg.poolMax ?? 10 },
    schema: 'public',
    migrations: {
      path:
        process.env.NODE_ENV === 'production'
          ? 'dist/apps/auth/src/migrations'
          : 'apps/auth/src/migrations',
      tableName: 'mikro_migrations_auth',
      safe: true,
      glob: '!(*.d).{js,ts}',
    },
  }).then(async (orm) => {
    await runMigrationsExclusively(orm);
    const em = orm.em.fork();
    for (const role of ROLE_SEED_ROWS) {
      await em.upsert(AuthRoleRecord, role);
    }
    await backfillLegacyRoleColumns(orm);
    return orm;
  });

  return ormPromise;
}
