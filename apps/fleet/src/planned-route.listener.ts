import { Inject, Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { RouteDeviationService } from "./contexts/fleet/tracking/application/route-deviation.service";

/** Follows dispatch's job lifecycle so each busy vehicle has its job's planned route. */
@Injectable()
export class PlannedRouteListener implements OnApplicationBootstrap {
  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    private readonly routeDeviation: RouteDeviationService,
  ) {}

  async onApplicationBootstrap() {
    // Dispatch publishes snake_case data.
    await this.bus.subscribe("tm.*.job.status.changed", async (envelope) => {
      const { job_id, new_status, assigned_vehicle_id } = envelope.data;
      if (typeof job_id !== "string" || typeof new_status !== "string") return;
      // A failure throws so the bus redelivers it.
      await this.routeDeviation.syncJob({
        tenantId: envelope.tenant_id,
        jobId: job_id,
        newStatus: new_status,
        vehicleId: typeof assigned_vehicle_id === "string" && assigned_vehicle_id ? assigned_vehicle_id : null,
      });
    }, "planned_route_sync");
  }
}
