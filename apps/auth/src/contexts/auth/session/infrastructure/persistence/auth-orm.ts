import { EntitySchema } from '@mikro-orm/core';
import { MikroORM } from '@mikro-orm/postgresql';
import { ROLE_SEED_ROWS, roleFromId, roleToId } from '@shared/rbac';

export type DbConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  dbName: string;
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

export class AuthUserRecord {
  id!: string;
  email!: string;
  passwordHash!: string;
  roleId!: number;
  tenantId!: string;
  accountStatus!: string;
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
  metadata!: Record<string, unknown>;
  occurredAt!: Date;
  recordedAt!: Date;
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
    metadata: { type: 'json', defaultRaw: "'{}'" },
    occurredAt: { type: 'datetime', index: true },
    recordedAt: { type: 'datetime', defaultRaw: 'now()' },
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

export async function getAuthOrm(cfg: DbConfig) {
  if (ormPromise) {
    return ormPromise;
  }

  ormPromise = MikroORM.init({
    entities: [
      AuthRoleRecordSchema,
      AuthSessionRecordSchema,
      AuthUserRecordSchema,
      InviteRecordSchema,
      PasswordResetRecordSchema,
      OrganizationSettingsRecordSchema,
      SystemSettingsRecordSchema,
      ActivityLogRecordSchema,
      SystemTenantOnboardingRecordSchema,
      SystemDeviceModelRecordSchema,
      SystemFeatureFlagRecordSchema,
      IotSimRecordSchema,
      SimProvisioningRequestRecordSchema,
      SimActivationBatchRecordSchema,
      SupportTicketRecordSchema,
      SupportMessageRecordSchema,
    ],
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    dbName: cfg.dbName,
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
    await orm.getMigrator().up();
    const em = orm.em.fork();
    for (const role of ROLE_SEED_ROWS) {
      await em.upsert(AuthRoleRecord, role);
    }
    await backfillLegacyRoleColumns(orm);
    return orm;
  });

  return ormPromise;
}
