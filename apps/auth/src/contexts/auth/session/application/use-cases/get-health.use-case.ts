import { Inject, Injectable } from "@nestjs/common";
import {
  AUTH_HEALTH_CHECK,
  type AuthHealthCheck,
} from "@auth/session/domain/ports/health-check.port";

@Injectable()
export class GetHealthUseCase {
  constructor(
    @Inject(AUTH_HEALTH_CHECK)
    private readonly healthCheck: AuthHealthCheck,
  ) {}

  async execute() {
    return this.healthCheck.check();
  }
}
