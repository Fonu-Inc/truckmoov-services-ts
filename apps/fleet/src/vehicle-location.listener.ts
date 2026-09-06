import { Inject, Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { GeofenceService } from "@shared/geofence";
import { GeofenceEvaluatorService } from "./contexts/fleet/tracking/application/geofence-evaluator.service";
import { LiveTrackingCountsService } from "./live-tracking-counts.service";
import { VehicleHealthService } from "./vehicle-health.service";

@Injectable()
export class VehicleLocationListener implements OnApplicationBootstrap {
  private readonly logger = new Logger(VehicleLocationListener.name);

  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    private readonly vehicleHealthService: VehicleHealthService,
    private readonly geofenceService: GeofenceService,
    private readonly liveCounts: LiveTrackingCountsService,
    private readonly geofenceEvaluator: GeofenceEvaluatorService,
  ) {}

  async onApplicationBootstrap() {
    await this.bus.subscribe("tm.*.vehicle.location.updated", async (envelope) => {
      const vehicleId = envelope.data["vehicle_id"] as string;
      if (!vehicleId) return;

      const ts = new Date(envelope.occurred_at).getTime();
      const deviceId = (envelope.data["device_id"] as string) || null;
      const lat = envelope.data["lat"] as number;
      const lng = envelope.data["lng"] as number;

      this.vehicleHealthService.touch(vehicleId, ts, deviceId, lat, lng);
      this.liveCounts.record({
        tenantId: envelope.tenant_id,
        vehicleId,
        fixedAt: new Date(ts).toISOString(),
        speedKph: (envelope.data["speed_kph"] as number | undefined) ?? null,
      });

      if (lat != null && lng != null) {
        await this.evaluateZones(envelope.tenant_id, vehicleId, lat, lng);

        const transition = this.geofenceService.checkTransition(vehicleId, { lat, lng });
        if (transition) {
          await this.bus.publish(`tm.${envelope.tenant_id}.vehicle.geofence.${transition}`, {
            id: crypto.randomUUID(),
            type: `vehicle.geofence.${transition}`,
            version: 1,
            occurred_at: new Date().toISOString(),
            tenant_id: envelope.tenant_id,
            data: { vehicle_id: vehicleId, lat, lng },
          });
        }
      }
    });
  }

  /**
   * Zone entry, exit and dwell. Separate from the bounding-box check above,
   * which is one corridor per vehicle for route deviation; these are the zones
   * an operator drew on the map.
   *
   * A failure here must not stop the position being recorded — the map staying
   * live matters more than one missed alert.
   */
  private async evaluateZones(
    tenantId: string,
    vehicleId: string,
    lat: number,
    lng: number,
  ): Promise<void> {
    try {
      const alerts = await this.geofenceEvaluator.evaluate({
        tenantId,
        vehicleId,
        point: { lat, lng },
      });

      for (const alert of alerts) {
        await this.bus.publish(`tm.${tenantId}.alert.triggered`, {
          id: crypto.randomUUID(),
          type: "alert.triggered",
          version: 1,
          occurred_at: new Date().toISOString(),
          tenant_id: tenantId,
          data: {
            alert_type: alert.type,
            severity: alert.severity,
            vehicle_id: alert.vehicleId,
            ...alert.details,
          },
        });
      }
    } catch (error) {
      this.logger.warn(
        `geofence_evaluation_failed:${vehicleId}:${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }
}
