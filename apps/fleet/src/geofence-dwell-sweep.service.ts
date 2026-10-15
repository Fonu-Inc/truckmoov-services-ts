import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AppConfigService } from "@shared/config";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import {
  GEOFENCE_ZONE_REPOSITORY,
  type GeofenceZoneRepository,
} from "./geofence-zone.repository";
import {
  ZONE_OCCUPANCY_REPOSITORY,
  type ZoneOccupancyRepository,
} from "./contexts/fleet/tracking/domain/zone-occupancy.repository";
import { zoneIsArmed } from "./contexts/fleet/tracking/domain/zone-transitions";

const SWEEP_BATCH = 200;

/**
 * Raises dwell alerts for vehicles that have gone quiet.
 *
 * Dwell is the one transition no position can trigger: a truck parked in a
 * restricted yard stops moving, and a device that stops moving often stops
 * reporting. Waiting for the next fix would mean the alert fires when the
 * vehicle leaves, which is exactly too late.
 */
@Injectable()
export class GeofenceDwellSweepService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(GeofenceDwellSweepService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    @Inject(ZONE_OCCUPANCY_REPOSITORY) private readonly occupancy: ZoneOccupancyRepository,
    @Inject(GEOFENCE_ZONE_REPOSITORY) private readonly zones: GeofenceZoneRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    const interval = this.config.liveTracking.sweepIntervalSeconds * 1000;
    this.timer = setInterval(() => void this.sweep(), interval);
    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async sweep(now = new Date()): Promise<number> {
    let raised = 0;

    try {
      // Anything newer than a minute cannot have breached the shortest dwell
      // an operator can configure, so the query skips it.
      const candidates = await this.occupancy.findPendingDwell(
        new Date(now.getTime() - 60_000),
        SWEEP_BATCH,
      );

      for (const stay of candidates) {
        const zone = await this.zones.findById(stay.zoneId, stay.tenantId);
        if (!zone?.dwellAlertsEnabled || zone.dwellMinutes === null) continue;

        const minutesInside = Math.floor((now.getTime() - stay.enteredAt.getTime()) / 60_000);
        if (minutesInside < zone.dwellMinutes) continue;

        // Claimed before publishing. A publish that fails is one missed alert;
        // claiming afterwards would re-raise it on every sweep from then on.
        if (!(await this.occupancy.claimDwellAlert(stay.tenantId, stay.vehicleId, stay.zoneId, now))) continue;
        if (!zoneIsArmed(zone, now)) continue;

        await this.publish(stay.tenantId, stay.vehicleId, zone.id, zone.name, zone.category, minutesInside);
        raised += 1;
      }
    } catch (error) {
      this.logger.warn(
        `geofence_dwell_sweep_failed:${error instanceof Error ? error.message : "unknown"}`,
      );
    }

    return raised;
  }

  private async publish(
    tenantId: string,
    vehicleId: string,
    zoneId: string,
    zoneName: string,
    zoneCategory: string,
    minutesInside: number,
  ): Promise<void> {
    await this.bus.publish(`tm.${tenantId}.alert.triggered`, {
      id: randomUUID(),
      type: "alert.triggered",
      version: 1,
      occurred_at: new Date().toISOString(),
      tenant_id: tenantId,
      data: {
        alert_type: "geofence_dwell",
        severity: "medium",
        vehicle_id: vehicleId,
        zoneId,
        zoneName,
        zoneCategory,
        minutesInside,
      },
    });
  }
}
