import { EntitySchema } from "@mikro-orm/core";
import { MikroORM } from "@mikro-orm/mysql";

export type DbConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  dbName: string;
};

/* ── Session ─────────────────────────────────────────── */

export class AuthSessionRecord {
  refreshToken!: string;
  userId!: string;
  username!: string;
  roles!: string[];
  tenantId!: string;
  updatedAt!: Date;
}

export const AuthSessionRecordSchema = new EntitySchema<AuthSessionRecord>({
  class: AuthSessionRecord,
  tableName: "auth_sessions",
  properties: {
    refreshToken: { type: "string", primary: true },
    userId: { type: "string", length: 64 },
    username: { type: "string", length: 128 },
    roles: { type: "json" },
    tenantId: { type: "string", length: 64, default: "default" },
    updatedAt: {
      type: "datetime",
      onUpdate: () => new Date(),
      defaultRaw: "now()",
    },
  },
});

/* ── User ────────────────────────────────────────────── */

export class AuthUserRecord {
  id!: string;
  username!: string;
  passwordHash!: string;
  roles!: string[];
  tenantId!: string;
  profile?: { fullName: string | null; phoneNumber: string | null };
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
  tableName: "auth_users",
  properties: {
    id: { type: "string", primary: true },
    username: { type: "string", length: 128, unique: true },
    passwordHash: { type: "string" },
    roles: { type: "json" },
    tenantId: { type: "string", length: 64, default: "default" },
    profile: { type: "json", nullable: true },
    notificationPreferences: { type: "json", nullable: true },
    dispatcherPreferences: { type: "json", nullable: true },
    createdAt: { type: "datetime", defaultRaw: "now()" },
  },
});

/* ── Organization Settings ───────────────────────────── */

export class OrganizationSettingsRecord {
  tenantId!: string;
  branding!: {
    organizationName: string;
    logoUrl: string | null;
    primaryColor: string | null;
    secondaryColor: string | null;
  };
  defaults!: {
    timezone: string;
    currency: string;
    dateFormat: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
    weekStartsOn: "monday" | "sunday";
  };
  updatedAt!: Date;
}

export const OrganizationSettingsRecordSchema =
  new EntitySchema<OrganizationSettingsRecord>({
    class: OrganizationSettingsRecord,
    tableName: "auth_organization_settings",
    properties: {
      tenantId: { type: "string", primary: true },
      branding: { type: "json" },
      defaults: { type: "json" },
      updatedAt: {
        type: "datetime",
        onUpdate: () => new Date(),
        defaultRaw: "now()",
      },
    },
  });

/* ── Invite ──────────────────────────────────────────── */

export class InviteRecord {
  id!: string;
  email!: string;
  role!: string;
  tenantId!: string;
  token!: string;
  invitedBy!: string;
  status!: string;
  expiresAt!: Date;
  createdAt!: Date;
}

export const InviteRecordSchema = new EntitySchema<InviteRecord>({
  class: InviteRecord,
  tableName: "auth_invites",
  properties: {
    id: { type: "string", primary: true },
    email: { type: "string", length: 255 },
    role: { type: "string", length: 64 },
    tenantId: { type: "string", length: 64 },
    token: { type: "string", length: 255, unique: true },
    invitedBy: { type: "string", length: 64 },
    status: { type: "string", length: 20, default: "pending" },
    expiresAt: { type: "datetime" },
    createdAt: { type: "datetime", defaultRaw: "now()" },
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
  tableName: "auth_password_resets",
  properties: {
    id: { type: "string", primary: true },
    userId: { type: "string", length: 64 },
    token: { type: "string", length: 255, unique: true },
    method: { type: "string", length: 10 },
    code: { type: "string", length: 10, nullable: true },
    used: { type: "boolean", default: false },
    expiresAt: { type: "datetime" },
    createdAt: { type: "datetime", defaultRaw: "now()" },
  },
});

/* ── ORM bootstrap ───────────────────────────────────── */

let ormPromise: Promise<MikroORM> | null = null;

export async function getAuthOrm(cfg: DbConfig) {
  if (ormPromise) {
    return ormPromise;
  }

  ormPromise = MikroORM.init({
    entities: [
      AuthSessionRecordSchema,
      AuthUserRecordSchema,
      InviteRecordSchema,
      PasswordResetRecordSchema,
      OrganizationSettingsRecordSchema,
    ],
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    dbName: cfg.dbName,
  }).then(async (orm) => {
    await orm.schema.updateSchema();
    return orm;
  });

  return ormPromise;
}
