import { defineConfig } from "@mikro-orm/postgresql";
import {
  AuthRoleRecordSchema,
  AuthSessionRecordSchema,
  AuthUserRecordSchema,
  InviteRecordSchema,
  PasswordResetRecordSchema,
  OrganizationSettingsRecordSchema,
} from "./src/contexts/auth/session/infrastructure/persistence/auth-orm";

export default defineConfig({
  host: process.env.POSTGRES_HOST ?? "localhost",
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  user: process.env.POSTGRES_USER ?? "truckmoov",
  password: process.env.POSTGRES_PASSWORD ?? "truckmoov",
  dbName: process.env.POSTGRES_DB ?? "truckmoov",
  entities: [
    AuthRoleRecordSchema,
    AuthSessionRecordSchema,
    AuthUserRecordSchema,
    InviteRecordSchema,
    PasswordResetRecordSchema,
    OrganizationSettingsRecordSchema,
  ],
  migrations: {
    path: "apps/auth/src/migrations",
    tableName: "mikro_migrations_auth",
    safe: true,
    glob: "!(*.d).{js,ts}",
  },
});
