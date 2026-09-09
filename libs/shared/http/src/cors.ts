import type { CorsOptions } from "@nestjs/common/interfaces/external/cors-options.interface";

const DEFAULT_CORS_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
];

export function createCorsOptions(originsEnv?: string): CorsOptions {
  const allowedOrigins = resolveAllowedOrigins(originsEnv);

  return {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      const allowed =
        allowedOrigins.includes("*") || allowedOrigins.includes(origin);
      callback(null, allowed);
    },
    credentials: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Idempotency-Key",
      "X-Application-Token",
      "x-user-role",
      // The vehicles list sends the tab it is rendering in this header; see
      // VEHICLE_TAB_HEADER. A browser cannot send it unless preflight allows it.
      "tabs",
    ],
  };
}

function resolveAllowedOrigins(originsEnv?: string) {
  const configuredOrigins = originsEnv?.trim();
  if (!configuredOrigins) {
    return DEFAULT_CORS_ORIGINS;
  }

  return configuredOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}
