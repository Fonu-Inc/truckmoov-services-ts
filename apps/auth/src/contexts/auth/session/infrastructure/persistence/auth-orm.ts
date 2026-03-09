import { EntitySchema } from "@mikro-orm/core";
import { MikroORM } from "@mikro-orm/postgresql";

export type DbConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  dbName: string;
};

export class AuthSessionRecord {
  refreshToken!: string;
  userId!: string;
  username!: string;
  roles!: string[];
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
    updatedAt: {
      type: "datetime",
      onUpdate: () => new Date(),
      defaultRaw: "now()",
    },
  },
});

let ormPromise: Promise<MikroORM> | null = null;

export async function getAuthOrm(cfg: DbConfig) {
  if (ormPromise) {
    return ormPromise;
  }

  ormPromise = MikroORM.init({
    entities: [AuthSessionRecordSchema],
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
