import { Inject, Injectable } from "@nestjs/common";
import type {
  AuthHealthCheck,
  AuthHealthStatus,
} from "@auth/session/domain/ports/health-check.port";
import { AppConfigService } from "@shared/config";
import { getAuthOrm } from "./persistence/auth-orm";

@Injectable()
export class AuthPersistenceHealthCheck implements AuthHealthCheck {
  constructor(
    @Inject(AppConfigService)
    private readonly config: AppConfigService,
  ) {}

  async check(): Promise<AuthHealthStatus> {
    const persistenceBackend = this.config.persistence.backend;

    if (persistenceBackend === "mikro-orm") {
      const orm = await getAuthOrm(this.config.db);
      await orm.em.getConnection().execute("select 1");
    }

    return {
      service: "auth",
      persistenceBackend,
      database: persistenceBackend === "mikro-orm" ? "up" : "n/a",
    };
  }
}
