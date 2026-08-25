import { Inject, Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import type { AlertSeverity } from "./contexts/fleet/alerts/domain/alert.entity";
import { TriggerAlertUseCase } from "./contexts/fleet/alerts";
import { GetVehicleUseCase } from "./contexts/fleet/vehicles";

@Injectable()
export class AlertDetectionListener implements OnApplicationBootstrap {
  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    private readonly triggerAlert: TriggerAlertUseCase,
    private readonly getVehicle: GetVehicleUseCase,
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

    await this.bus.subscribe("tm.*.vehicle.geofence.exited", async (envelope) => {
      const vehicleId = envelope.data["vehicle_id"] as string;
      if (!vehicleId) return;

      let alertType = "route_deviation";
      try {
        const vehicle = await this.getVehicle.execute(vehicleId, envelope.tenant_id);
        if ((vehicle as unknown as { status: string }).status === "inactive") {
          alertType = "unauthorized_usage";
        }
      } catch {
        // vehicle not found — treat as unauthorized
        alertType = "unauthorized_usage";
      }

      await this.triggerAlert.execute({
        id: crypto.randomUUID(),
        tenantId: envelope.tenant_id,
        type: alertType,
        severity: alertType === "unauthorized_usage" ? "high" : "medium",
        vehicleId,
        details: { lat: envelope.data["lat"], lng: envelope.data["lng"] },
      });
    }, "alert_detection");
  }
}
