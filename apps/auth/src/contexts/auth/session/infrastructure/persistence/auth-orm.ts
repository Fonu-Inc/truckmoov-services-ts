import { EntitySchema } from "@mikro-orm/core";
import { MikroORM } from "@mikro-orm/postgresql";

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

export async function getAuthOrm() {
  if (ormPromise) {
    return ormPromise;
  }

  ormPromise = MikroORM.init({
    entities: [AuthSessionRecordSchema],
    host: process.env.POSTGRES_HOST ?? "localhost",
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    user: process.env.POSTGRES_USER ?? "truckmoov",
    password: process.env.POSTGRES_PASSWORD ?? "truckmoov",
    dbName: process.env.POSTGRES_DB ?? "truckmoov",
  }).then(async (orm) => {
    // Keep bootstrap behavior aligned with previous auto-sync semantics.
    await orm.schema.updateSchema();
    return orm;
  });

  return ormPromise;
}
