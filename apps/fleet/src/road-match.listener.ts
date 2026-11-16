import { Inject, Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { RoadSpeedEvaluatorService } from "./contexts/fleet/tracking/application/road-speed-evaluator.service";
import { RouteDeviationService } from "./contexts/fleet/tracking/application/route-deviation.service";
import type { RoadMatchedFix } from "./contexts/fleet/tracking/domain/road-matched-fix";
import { busVerifier } from "./verified-bus-handler";

type Alert = { type: string; severity: string; jobId?: string; details: Record<string, unknown> };

/**
 * Road rules for fixes tracking has map-matched: road speed limits and route
 * deviation. Each rule fails on its own; a missed alert must not stop the other.
 */
@Injectable()
export class RoadMatchListener implements OnApplicationBootstrap {
  private readonly logger = new Logger(RoadMatchListener.name);

  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    private readonly roadSpeed: RoadSpeedEvaluatorService,
    private readonly routeDeviation: RouteDeviationService,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async onApplicationBootstrap() {
    await this.bus.subscribe("tm.*.vehicle.road.matched", busVerifier(this.config, this.logger)(async (envelope) => {
      const fix = toFix(envelope.tenant_id, envelope.data, envelope.occurred_at);
      if (!fix) return;
      await this.apply("road_speed", fix, () => this.roadSpeed.evaluate(fix));
      await this.apply("route_deviation", fix, () => this.routeDeviation.check(fix));
    }), "road_rules");
  }

  private async apply(rule: string, fix: RoadMatchedFix, run: () => Promise<Alert | null>): Promise<void> {
    try {
      const alert = await run();
      if (alert) await this.publish(fix, alert);
    } catch (error) {
      this.logger.warn(`${rule}_failed:${fix.vehicleId}:${error instanceof Error ? error.message : "unknown"}`);
    }
  }

  private async publish(fix: RoadMatchedFix, alert: Alert): Promise<void> {
    await this.bus.publish(`tm.${fix.tenantId}.alert.triggered`, {
      id: crypto.randomUUID(),
      type: "alert.triggered",
      version: 1,
      occurred_at: new Date().toISOString(),
      tenant_id: fix.tenantId,
      data: {
        alert_type: alert.type,
        severity: alert.severity,
        vehicle_id: fix.vehicleId,
        ...(alert.jobId ? { job_id: alert.jobId } : {}),
        ...alert.details,
      },
    });
  }
}

function toFix(tenantId: string, data: Record<string, unknown>, occurredAt: string): RoadMatchedFix | null {
  const { vehicle_id, lat, lng, speed_kph, road_class, road_name, osm_speed_limit_kph, way_id, fix_time } = data;
  if (typeof vehicle_id !== "string" || typeof lat !== "number" || typeof lng !== "number" || typeof speed_kph !== "number") {
    return null;
  }
  const at = new Date(typeof fix_time === "string" && fix_time ? fix_time : occurredAt);
  return {
    tenantId,
    vehicleId: vehicle_id,
    point: { lat, lng },
    speedKph: speed_kph,
    roadClass: typeof road_class === "string" ? road_class : "",
    roadName: typeof road_name === "string" ? road_name : "",
    osmSpeedLimitKph: typeof osm_speed_limit_kph === "number" ? osm_speed_limit_kph : null,
    wayId: typeof way_id === "number" ? way_id : 0,
    at: Number.isNaN(at.getTime()) ? new Date() : at,
  };
}
