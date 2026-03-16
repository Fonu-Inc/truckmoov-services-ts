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
      "@shared/observability": path.resolve(__dirname, "libs/shared/observability/src"),
      "@shared/eventbus": path.resolve(__dirname, "libs/shared/eventbus/src"),
      "@shared/mailer": path.resolve(__dirname, "libs/shared/mailer/src"),
      "@shared/object-storage": path.resolve(__dirname, "libs/shared/object-storage/src"),
      "@shared/geofence": path.resolve(__dirname, "libs/shared/geofence/src"),
      "@shared/sms": path.resolve(__dirname, "libs/shared/sms/src"),
      "@auth/session": path.resolve(__dirname, "apps/auth/src/contexts/auth/session"),
      "@fleet/shared": path.resolve(__dirname, "apps/fleet/src/contexts/fleet/shared"),
      "@auth/templates": path.resolve(__dirname, "apps/auth/src/templates"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    clearMocks: true,
    setupFiles: ["tests/setup.ts"],
    hookTimeout: 30_000,
  },
});
