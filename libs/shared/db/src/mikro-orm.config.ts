import { defineConfig } from "@mikro-orm/postgresql";

export default defineConfig({
  host: process.env.POSTGRES_HOST ?? "localhost",
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  user: process.env.POSTGRES_USER ?? "truckmoov",
  password: process.env.POSTGRES_PASSWORD ?? "truckmoov",
  dbName: process.env.POSTGRES_DB ?? "truckmoov",
  entities: [],
  migrations: {
    path: "libs/shared/db/src/migrations",
    glob: "!(*.d).{js,ts}",
  },
});
