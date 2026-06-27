import { defineConfig } from "@mikro-orm/postgresql";
import {
  VehicleRecordSchema,
  DriverRecordSchema,
} from "./src/contexts/fleet/shared/infrastructure/persistence/fleet-orm";

export default defineConfig({
  host: process.env.POSTGRES_HOST ?? "localhost",
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  user: process.env.POSTGRES_USER ?? "truckmoov",
  password: process.env.POSTGRES_PASSWORD ?? "truckmoov",
  dbName: process.env.POSTGRES_DB ?? "truckmoov",
  entities: [VehicleRecordSchema, DriverRecordSchema],
  migrations: {
    path: "apps/fleet/src/migrations",
    tableName: "mikro_migrations_fleet",
    safe: true,
    glob: "!(*.d).{js,ts}",
  },
});
