import { Inject, Injectable } from "@nestjs/common";
import type {
  AuthHealthCheck,
  AuthHealthStatus,
} from "@auth/session/domain/ports/health-check.port";
import { AppConfigService } from "@shared/config";

@Injectable()
export class AuthPersistenceHealthCheck implements AuthHealthCheck {
  constructor(
    @Inject(AppConfigService)
    private readonly config: AppConfigService,
  ) {}

  // Liveness must never touch the pool; the database is checked by /auth/health/ready.
  async check(): Promise<AuthHealthStatus> {
    return {
      service: "auth",
      persistenceBackend: this.config.persistence.backend,
      database: "n/a",
    };
  }
}
