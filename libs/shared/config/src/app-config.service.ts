import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

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

  get app() {
    return {
      frontendUrl: this.config.get<string>("FRONTEND_URL", "http://localhost:3000"),
    };
  }
}
