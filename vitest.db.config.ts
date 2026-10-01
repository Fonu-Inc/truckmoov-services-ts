import { defineConfig } from "vitest/config";
import base from "./vitest.config";

process.env.TEST_DATABASE_URL ??= "postgres://test:test@127.0.0.1:55999/truckmoov_test";

export default defineConfig({
  resolve: base.resolve,
  test: {
    ...base.test,
    include: ["tests/db/**/*.test.ts"],
    fileParallelism: false,
    exclude: ["**/node_modules/**"],
    hookTimeout: 300_000,
    testTimeout: 120_000,
  },
});
