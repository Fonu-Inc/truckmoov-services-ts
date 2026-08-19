import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NodeEnv } from "./node-env";

// Known placeholder/dev-default secret values that must never reach production.
const PLACEHOLDER_SECRETS = new Set(["replace-me", "change-me", "truckmoov", "replace"]);

@Injectable()
export class AppConfigService {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    this.validateSecrets();
  }

  // Fail fast in production when critical secrets are unset, empty, or left at a
  // known placeholder value. In non-production, warn but allow so local/dev boots.
  private validateSecrets(): void {
    const isProd = this.config.get<string>("NODE_ENV", NodeEnv.Development) === NodeEnv.Production;
    const required: Array<[string, string | undefined]> = [
      ["JWT_SECRET", this.config.get<string>("JWT_SECRET")],
      ["POSTGRES_PASSWORD", this.config.get<string>("POSTGRES_PASSWORD")],
    ];

    const invalid = required
      .filter(([, value]) => {
        const v = (value ?? "").trim().toLowerCase();
        return v === "" || PLACEHOLDER_SECRETS.has(v);
      })
      .map(([name]) => name);

    if (invalid.length === 0) return;

    const message = `Insecure or missing secrets: ${invalid.join(", ")}. Set strong values via environment variables.`;
    if (isProd) throw new Error(message);
    console.warn(`[AppConfigService] WARNING: ${message}`);
  }

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

  get redis() {
    return {
      // Enabled by default; the idempotency guard degrades to an in-memory
      // fallback if the connection is unavailable, so this stays safe in dev.
      enabled: this.config.get<string>("REDIS_ENABLED", "true") !== "false",
      host: this.config.get<string>("REDIS_HOST", "localhost"),
      port: this.config.get<number>("REDIS_PORT", 6379),
      password: this.config.get<string>("REDIS_PASSWORD", "") || undefined,
      keyPrefix: this.config.get<string>("REDIS_KEY_PREFIX", "truckmoov:"),
      // Idempotency key retention window.
      idempotencyTtlSeconds: this.config.get<number>("IDEMPOTENCY_TTL_SECONDS", 86400),
    };
  }

  get nats() {
    return {
      url: this.config.get<string>("NATS_URL", "nats://localhost:4222"),
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
      // Arbitrary label rotated alongside JWT_SECRET, NOT derived from it —
      // safe to log at startup so two services' logs can be diffed to
      // confirm they're on the same secret generation. Never derive
      // anything (hash, fingerprint, etc.) from JWT_SECRET itself for
      // logging: even a truncated one-way digest is an offline verification
      // oracle if the secret is ever weak, and log stores are a lower trust
      // boundary than the secret store.
      jwtKeyId: this.config.get<string>("JWT_KEY_ID", "unset"),
      // Deliberately strict defaults independent of the general API rate
      // limit: a handful of attempts, then a slow refill, to throttle
      // credential-stuffing/brute-force without needing per-deployment env
      // tuning to get a safe-by-default value.
      loginRateLimitRps: this.config.get<number>("LOGIN_RATE_LIMIT_RPS", 0.1),
      loginRateLimitBurst: this.config.get<number>("LOGIN_RATE_LIMIT_BURST", 5),
    };
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
