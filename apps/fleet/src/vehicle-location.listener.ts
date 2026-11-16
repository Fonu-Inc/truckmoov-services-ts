import { Inject, Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { EVENT_BUS, type EventBus, type EventEnvelope } from "@shared/eventbus";
import { GeofenceEvaluatorService } from "./contexts/fleet/tracking/application/geofence-evaluator.service";
import { LiveTrackingCountsService } from "./live-tracking-counts.service";
import { busVerifier } from "./verified-bus-handler";
import {
  VEHICLE_POSITION_REPOSITORY,
  type GeoPoint,
  type VehiclePositionRepository,
} from "./contexts/fleet/tracking/domain/vehicle-position.repository";

@Injectable()
export class VehicleLocationListener implements OnApplicationBootstrap {
  private readonly logger = new Logger(VehicleLocationListener.name);

  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    @Inject(VEHICLE_POSITION_REPOSITORY) private readonly positions: VehiclePositionRepository,
    private readonly liveCounts: LiveTrackingCountsService,
    private readonly geofenceEvaluator: GeofenceEvaluatorService,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async onApplicationBootstrap() {
    const verified = busVerifier(this.config, this.logger);
    await this.bus.subscribe("tm.*.vehicle.location.updated", verified(async (envelope) => {
      const vehicleId = envelope.data["vehicle_id"] as string;
      if (!vehicleId) return;

      const ts = fixTimeOf(envelope);
      const deviceId = (envelope.data["device_id"] as string) || null;
      const lat = envelope.data["lat"] as number;
      const lng = envelope.data["lng"] as number;
      const speedKph = (envelope.data["speed_kph"] as number | null | undefined) ?? null;

      const point = lat != null && lng != null ? { lat, lng } : null;
      await this.recordPosition(envelope.tenant_id, vehicleId, deviceId, point, ts);
      if (point) await this.evaluateZones(envelope.tenant_id, vehicleId, point, speedKph, ts);
    }));

    // Counts live in each pod's memory, so every pod needs every fix, not its share of the durable.
    await this.bus.subscribeEveryInstance?.("tm.*.vehicle.location.updated", verified(async (envelope) => {
      const vehicleId = envelope.data["vehicle_id"] as string;
      if (!vehicleId) return;
      const ts = fixTimeOf(envelope);
      this.liveCounts.record({
        tenantId: envelope.tenant_id,
        vehicleId,
        fixedAt: new Date(Number.isFinite(ts) ? ts : Date.now()).toISOString(),
        speedKph: (envelope.data["speed_kph"] as number | null | undefined) ?? null,
      });
    }));
  }

  /** A failed write must not stop zone evaluation or the live counts. */
  private async recordPosition(
    tenantId: string,
    vehicleId: string,
    deviceId: string | null,
    point: GeoPoint | null,
    timestamp: number,
  ): Promise<void> {
    try {
      const recordedAt = new Date(Number.isFinite(timestamp) ? timestamp : Date.now());
      await this.positions.record({ tenantId, vehicleId, deviceId, point, recordedAt });
    } catch (error) {
      this.logger.warn(
        `position_record_failed:${vehicleId}:${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }

  /**
   * Zone entry, exit and dwell for the zones an operator drew on the map.
   *
   * A failure here must not stop the position being recorded — the map staying
   * live matters more than one missed alert.
   */
  private async evaluateZones(
    tenantId: string,
    vehicleId: string,
    point: GeoPoint,
    speedKph: number | null,
    timestamp: number,
  ): Promise<void> {
    try {
      const at = Number.isFinite(timestamp) ? new Date(timestamp) : undefined;
      const alerts = await this.geofenceEvaluator.evaluate({ tenantId, vehicleId, point, speedKph, at });

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

/** The device's fix time, so a buffered upload arriving late never replaces a newer position. */
function fixTimeOf(envelope: EventEnvelope): number {
  return timestampOf(envelope.data["fix_time"]) ?? new Date(envelope.occurred_at).getTime();
}

function timestampOf(value: unknown): number | null {
  const ms = typeof value === "string" && value ? new Date(value).getTime() : NaN;
  return Number.isFinite(ms) ? ms : null;
}
