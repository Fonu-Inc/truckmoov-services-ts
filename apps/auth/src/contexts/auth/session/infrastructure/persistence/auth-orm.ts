import { EntitySchema } from "@mikro-orm/core";
import { MikroORM } from "@mikro-orm/mysql";
import { ROLE_SEED_ROWS, roleFromId, roleToId } from "@shared/rbac";

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
  tableName: "auth_roles",
  properties: {
    id: { type: "number", primary: true },
    name: { type: "string", length: 64, unique: true },
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
  tableName: "auth_sessions",
  properties: {
    refreshToken: { type: "string", primary: true },
    userId: { type: "string", length: 64 },
    email: { type: "string", length: 128 },
    roleId: { type: "number" },
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
  email!: string;
  passwordHash!: string;
  roleId!: number;
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
    email: { type: "string", length: 128, unique: true },
    passwordHash: { type: "string" },
    roleId: { type: "number" },
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
  tableName: "auth_invites",
  properties: {
    id: { type: "string", primary: true },
    email: { type: "string", length: 255 },
    roleId: { type: "number" },
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

export function mapRoleIdToName(roleId: number): string {
  return roleFromId(roleId);
}

export function mapRoleNameToId(role: string): number {
  return roleToId(role);
}

async function hasColumn(orm: MikroORM, tableName: string, columnName: string) {
  const connection = orm.em.getConnection();
  const rows = await connection.execute(
    `SHOW COLUMNS FROM \`${tableName}\` LIKE ?`,
    [columnName],
  ) as Array<Record<string, unknown>>;
  return rows.length > 0;
}

async function backfillLegacyRoleColumns(orm: MikroORM) {
  const connection = orm.em.getConnection();

  if (
    await hasColumn(orm, "auth_users", "roles")
    && await hasColumn(orm, "auth_users", "role_id")
  ) {
    const rows = await connection.execute(
      "SELECT id, roles, role_id FROM auth_users",
    ) as Array<{ id: string; roles: string | string[] | null; role_id: number | null }>;

    for (const row of rows) {
      if (row.role_id || !row.roles) {
        continue;
      }
      const roles = Array.isArray(row.roles)
        ? row.roles
        : JSON.parse(row.roles) as string[];
      await connection.execute(
        "UPDATE auth_users SET role_id = ? WHERE id = ?",
        [mapRoleNameToId(roles[0]), row.id],
      );
    }
  }

  if (
    await hasColumn(orm, "auth_sessions", "roles")
    && await hasColumn(orm, "auth_sessions", "role_id")
  ) {
    const rows = await connection.execute(
      "SELECT refresh_token, roles, role_id FROM auth_sessions",
    ) as Array<{ refresh_token: string; roles: string | string[] | null; role_id: number | null }>;

    for (const row of rows) {
      if (row.role_id || !row.roles) {
        continue;
      }
      const roles = Array.isArray(row.roles)
        ? row.roles
        : JSON.parse(row.roles) as string[];
      await connection.execute(
        "UPDATE auth_sessions SET role_id = ? WHERE refresh_token = ?",
        [mapRoleNameToId(roles[0]), row.refresh_token],
      );
    }
  }

  if (
    await hasColumn(orm, "auth_invites", "role")
    && await hasColumn(orm, "auth_invites", "role_id")
  ) {
    const rows = await connection.execute(
      "SELECT id, role, role_id FROM auth_invites",
    ) as Array<{ id: string; role: string | null; role_id: number | null }>;

    for (const row of rows) {
      if (row.role_id || !row.role) {
        continue;
      }
      await connection.execute(
        "UPDATE auth_invites SET role_id = ? WHERE id = ?",
        [roleToId(row.role), row.id],
      );
    }
  }
}

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
    ],
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    dbName: cfg.dbName,
  }).then(async (orm) => {
    await orm.schema.updateSchema();
    const em = orm.em.fork();
    for (const role of ROLE_SEED_ROWS) {
      await em.upsert(AuthRoleRecord, role);
    }
    await backfillLegacyRoleColumns(orm);
    return orm;
  });

  return ormPromise;
}
