import { Inject, Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import type { AlertSeverity } from "./contexts/fleet/alerts/domain/alert.entity";
import { TriggerAlertUseCase } from "./contexts/fleet/alerts";

@Injectable()
export class AlertDetectionListener implements OnApplicationBootstrap {
  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    private readonly triggerAlert: TriggerAlertUseCase,
  ) {}

  async onApplicationBootstrap() {
    await this.bus.subscribe("tm.*.alert.triggered", async (envelope) => {
      await this.triggerAlert.execute({
        id: envelope.id,
        tenantId: envelope.tenant_id,
        type: (envelope.data["alert_type"] as string) ?? "generic",
        severity: ((envelope.data["severity"] as string) ?? "medium") as AlertSeverity,
        vehicleId: (envelope.data["vehicle_id"] as string) || undefined,
        jobId: (envelope.data["job_id"] as string) || undefined,
        details: envelope.data,
      });
    }, "alert_detection");
  }
}
