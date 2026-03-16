import { Inject, Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { VehicleHealthService } from "./vehicle-health.service";

@Injectable()
export class VehicleLocationListener implements OnApplicationBootstrap {
  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    private readonly vehicleHealthService: VehicleHealthService,
  ) {}

  async onApplicationBootstrap() {
    await this.bus.subscribe("tm.*.vehicle.location.updated", async (envelope) => {
      const vehicleId = envelope.data["vehicle_id"] as string;
      if (!vehicleId) return;
      const ts = new Date(envelope.occurred_at).getTime();
      const deviceId = (envelope.data["device_id"] as string) || null;
      this.vehicleHealthService.touch(vehicleId, ts, deviceId);
    });
  }
}
