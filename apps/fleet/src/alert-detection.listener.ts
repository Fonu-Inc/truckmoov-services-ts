import { Inject, Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import type { AlertSeverity } from "./contexts/fleet/alerts/domain/alert.entity";
import { TriggerAlertUseCase } from "./contexts/fleet/alerts";
import { busVerifier } from "./verified-bus-handler";

@Injectable()
export class AlertDetectionListener implements OnApplicationBootstrap {
  private readonly logger = new Logger(AlertDetectionListener.name);

  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    private readonly triggerAlert: TriggerAlertUseCase,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async onApplicationBootstrap() {
    await this.bus.subscribe("tm.*.alert.triggered", busVerifier(this.config, this.logger)(async (envelope) => {
      await this.triggerAlert.execute({
        id: envelope.id,
        tenantId: envelope.tenant_id,
        type: (envelope.data["alert_type"] as string) ?? "generic",
        severity: ((envelope.data["severity"] as string) ?? "medium") as AlertSeverity,
        vehicleId: (envelope.data["vehicle_id"] as string) || undefined,
        jobId: (envelope.data["job_id"] as string) || undefined,
        details: envelope.data,
      });
    }), "alert_detection");
  }
}
