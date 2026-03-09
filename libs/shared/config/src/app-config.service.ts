import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService) {}

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
}
