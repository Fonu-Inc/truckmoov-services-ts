import { Inject, Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { GeofenceService } from "@shared/geofence";
import { VehicleHealthService } from "./vehicle-health.service";

@Injectable()
export class VehicleLocationListener implements OnApplicationBootstrap {
  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    private readonly vehicleHealthService: VehicleHealthService,
    private readonly geofenceService: GeofenceService,
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

      if (lat != null && lng != null) {
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
}
