import path from "node:path";
import { defineConfig } from "vitest/config";

process.env.NODE_ENV = "development";

export default defineConfig({
  resolve: {
    alias: {
      "@shared/config": path.resolve(__dirname, "libs/shared/config/src"),
      "@shared/crypto": path.resolve(__dirname, "libs/shared/crypto/src"),
      "@shared/csv": path.resolve(__dirname, "libs/shared/csv/src"),
      "@shared/devices": path.resolve(__dirname, "libs/shared/devices/src"),
      "@shared/audit": path.resolve(__dirname, "libs/shared/audit/src"),
      "@shared/logger": path.resolve(__dirname, "libs/shared/logger/src"),
      "@shared/db": path.resolve(__dirname, "libs/shared/db/src"),
      "@shared/rbac": path.resolve(__dirname, "libs/shared/rbac/src"),
      "@shared/http": path.resolve(__dirname, "libs/shared/http/src"),
      "@shared/openapi": path.resolve(__dirname, "libs/shared/openapi/src"),
      "@shared/observability": path.resolve(__dirname, "libs/shared/observability/src"),
      "@shared/metrics": path.resolve(__dirname, "libs/shared/metrics/src"),
      "@shared/eventbus": path.resolve(__dirname, "libs/shared/eventbus/src"),
      "@shared/mailer": path.resolve(__dirname, "libs/shared/mailer/src"),
      "@shared/object-storage": path.resolve(__dirname, "libs/shared/object-storage/src"),
      "@shared/geofence": path.resolve(__dirname, "libs/shared/geofence/src"),
      "@shared/sms": path.resolve(__dirname, "libs/shared/sms/src"),
      "@auth/session": path.resolve(__dirname, "apps/auth/src/contexts/auth/session"),
      "@auth/installation": path.resolve(__dirname, "apps/auth/src/contexts/installation"),
      "@auth/onboarding": path.resolve(__dirname, "apps/auth/src/contexts/onboarding"),
      "@fleet/shared": path.resolve(__dirname, "apps/fleet/src/contexts/fleet/shared"),
      "@auth/templates": path.resolve(__dirname, "apps/auth/src/templates"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    clearMocks: true,
    setupFiles: ["tests/setup.ts"],
    // Booting a Nest app is the slow hook, and the auth module has grown a
    // long way this year. Thirty seconds was enough until the whole suite ran
    // in parallel with it; the boot is not hanging, it is being starved. Sixty
    // stopped being enough once the onboarding context was added, for the same
    // reason rather than a new one.
    hookTimeout: 120_000,
  },
});
