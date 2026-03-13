import path from "node:path";
import { defineConfig } from "vitest/config";

process.env.NODE_ENV = "development";

export default defineConfig({
  resolve: {
    alias: {
      "@shared/config": path.resolve(__dirname, "libs/shared/config/src"),
      "@shared/logger": path.resolve(__dirname, "libs/shared/logger/src"),
      "@shared/db": path.resolve(__dirname, "libs/shared/db/src"),
      "@shared/rbac": path.resolve(__dirname, "libs/shared/rbac/src"),
      "@shared/http": path.resolve(__dirname, "libs/shared/http/src"),
      "@shared/openapi": path.resolve(__dirname, "libs/shared/openapi/src"),
      "@shared/eventbus": path.resolve(__dirname, "libs/shared/eventbus/src"),
      "@shared/mailer": path.resolve(__dirname, "libs/shared/mailer/src"),
      "@shared/sms": path.resolve(__dirname, "libs/shared/sms/src"),
      "@auth/templates": path.resolve(__dirname, "apps/auth/src/templates"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    clearMocks: true,
    setupFiles: ["tests/setup.ts"],
  },
});
