import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AppConfigService } from "@shared/config";
import type { FleetRuntime } from "@fleet/shared/domain/ports/fleet-runtime.port";

@Injectable()
export class DefaultFleetRuntime implements FleetRuntime {
  constructor(
    @Inject(AppConfigService)
    private readonly config: AppConfigService,
  ) {}

  generateId(): string {
    return randomUUID();
  }

  getDefaultTenantId(): string {
    return this.config.fleet.defaultTenant;
  }
}
