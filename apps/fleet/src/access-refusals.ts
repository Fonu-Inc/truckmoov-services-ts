import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { VerifiedCallerAudience, type Refusal, type RefusalReporter } from "@shared/access";
import { AppConfigService } from "@shared/config";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { SYSTEM_TENANT_ID } from "@shared/identity";

@Injectable()
export class FleetCallerAudience extends VerifiedCallerAudience {
  constructor(@Inject(AppConfigService) config: AppConfigService) {
    super(config, "fleet");
  }
}

/** Sends refusals to auth, which keeps the per-IP record automatic blocking counts. */
@Injectable()
export class FleetRefusalReporter implements RefusalReporter {
  private readonly logger = new Logger(FleetRefusalReporter.name);

  constructor(@Inject(EVENT_BUS) private readonly bus: EventBus) {}

  report(refusal: Refusal): void {
    this.bus
      .publish("tm.system.access.refused", {
        id: randomUUID(),
        type: "access.refused",
        version: 1,
        occurred_at: new Date().toISOString(),
        tenant_id: SYSTEM_TENANT_ID,
        data: { service: "fleet", ...refusal },
      })
      .catch((error: Error) => this.logger.warn(`access_refused_publish_failed:${error.message}`));
  }
}
