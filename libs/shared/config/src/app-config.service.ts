import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";
import { NodeEnv } from "./node-env";

@Injectable()
export class AppConfigService {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  get db() {
    return {
      host: this.config.get("POSTGRES_HOST", "localhost"),
      port: this.config.get<number>("POSTGRES_PORT", 5432),
      user: this.config.get("POSTGRES_USER", "truckmoov"),
      password: this.config.get("POSTGRES_PASSWORD", "truckmoov"),
      dbName: this.config.get("POSTGRES_DB", "truckmoov"),
    };
  }

  get server() {
    return {
      authPort: this.config.get<number>("AUTH_PORT", 3001),
      fleetPort: this.config.get<number>("FLEET_PORT", 3002),
      corsAllowedOrigins: this.config.get<string | undefined>("CORS_ALLOWED_ORIGINS", undefined),
    };
  }

  get fleet() {
    return {
      defaultTenant: this.config.get("DEFAULT_TENANT", "default"),
      reportIntervalHours: this.config.get<number>("REPORT_INTERVAL_HOURS", 24),
      alertEscalationMinutes: this.config.get<number>("ALERT_ESCALATION_MINUTES", 30),
      documentRetentionDays: this.config.get<number>("DOCUMENT_RETENTION_DAYS", 365),
      rateLimitRps: this.config.get<number>("RATE_LIMIT_RPS", 100),
      rateLimitBurst: this.config.get<number>("RATE_LIMIT_BURST", 200),
    };
  }

  get webhooks() {
    return {
      erpSecret: this.config.get<string>("ERP_WEBHOOK_SECRET", ""),
    };
  }

  get traccar() {
    return {
      baseUrl: this.config.get<string>("TRACCAR_BASE_URL", ""),
      adminEmail: this.config.get<string>("TRACCAR_ADMIN_EMAIL", ""),
      adminPassword: this.config.get<string>("TRACCAR_ADMIN_PASSWORD", ""),
    };
  }

  get dispatch() {
    return {
      serviceUrl: this.config.get<string>("DISPATCH_SERVICE_URL", "http://localhost:3005"),
    };
  }

  get persistence() {
    return {
      backend: this.config.get("PERSISTENCE_BACKEND", "mikro-orm"),
    };
  }

  get mail() {
    return {
      transport: this.config.get<string>("MAIL_TRANSPORT", "null"),
      region: this.config.get<string>("AWS_REGION", "us-east-1"),
      from: this.config.get<string>("MAIL_FROM", "noreply@truckmoov.com"),
      smtp: {
        host: this.config.get<string>("SMTP_HOST", ""),
        port: this.config.get<number>("SMTP_PORT", 465),
        username: this.config.get<string>("SMTP_USERNAME", ""),
        password: this.config.get<string>("SMTP_PASSWORD", ""),
      },
    };
  }

  get sms() {
    return {
      transport: this.config.get<string>("SMS_TRANSPORT", "null"),
      dotgoApiUrl: this.config.get<string>("DOTGO_API_URL", ""),
      dotgoApiKey: this.config.get<string>("DOTGO_API_KEY", ""),
      dotgoSenderId: this.config.get<string>("DOTGO_SENDER_ID", "TruckMoov"),
    };
  }

  get objectStorage() {
    return {
      provider: this.config.get<string>("OBJECT_STORAGE_PROVIDER", "wasabi"),
      region: this.config.get<string>("OBJECT_STORAGE_REGION", "us-east-1"),
      endpoint: this.config.get<string>(
        "OBJECT_STORAGE_ENDPOINT",
        "https://s3.us-east-1.wasabisys.com",
      ),
      bucket: this.config.get<string>("OBJECT_STORAGE_BUCKET", "truckmoov-dev"),
      publicBucket: this.config.get<string>("OBJECT_STORAGE_PUBLIC_BUCKET", ""),
      accessKey: this.config.get<string>("OBJECT_STORAGE_ACCESS_KEY", ""),
      secretKey: this.config.get<string>("OBJECT_STORAGE_SECRET_KEY", ""),
      forcePathStyle: this.config.get<string>("OBJECT_STORAGE_FORCE_PATH_STYLE", "false") === "true",
      publicBaseUrl: this.config.get<string>("OBJECT_STORAGE_PUBLIC_BASE_URL", ""),
      prefix: this.config.get<string>("OBJECT_STORAGE_PREFIX", ""),
    };
  }

  get app() {
    return {
      frontendUrl: this.config.get<string>("FRONTEND_URL", "http://localhost:3000"),
      emailVerificationPath: this.config.get<string>("EMAIL_VERIFICATION_PATH", "/auth/verify-email"),
      inviteAcceptPath: this.config.get<string>("INVITE_ACCEPT_PATH", "/auth/invite"),
      env: this.config.get<NodeEnv>("NODE_ENV", NodeEnv.Development),
    };
  }

  get auth() {
    return {
      jwtSecret: this.config.get<string>("JWT_SECRET", "replace-me"),
    };
  }

  /**
   * Short, non-reversible fingerprint of JWT_SECRET (first 8 hex chars of
   * its SHA-256 digest) — safe to log at startup so two services' logs can
   * be diffed to confirm they're using the same secret, without ever
   * exposing the secret itself. JWT_SECRET must never be logged directly.
   */
  get jwtSecretFingerprint(): string {
    return createHash("sha256").update(this.auth.jwtSecret).digest("hex").slice(0, 8);
  }

  get superadmin() {
    return {
      email: this.config.get<string>("SUPERADMIN_EMAIL", ""),
      password: this.config.get<string>("SUPERADMIN_PASSWORD", ""),
      fullName: this.config.get<string>("SUPERADMIN_FULL_NAME", "Truckmoov Super Admin"),
      tenantId: this.config.get<string>("SUPERADMIN_TENANT_ID", "system"),
    };
  }

  get sentry() {
    return {
      dsn: this.config.get<string>("SENTRY_DSN", ""),
      environment: this.config.get<string>("SENTRY_ENVIRONMENT", this.app.env),
    };
  }

  get payment() {
    return {
      paystackBaseUrl: this.config.get<string>("PAYSTACK_BASE_URL", "https://api.paystack.co"),
      paystackSecretKey: this.config.get<string>("PAYSTACK_SECRET_KEY", ""),
      exchangeRateApiKey: this.config.get<string>("EXCHANGE_RATE_API_KEY", ""),
    };
  }
}
