import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import {
  GEOFENCE_ZONE_REPOSITORY,
  type GeofenceZoneRepository,
} from "../../../../geofence-zone.repository";
import type { RoadMatchedFix } from "../domain/road-matched-fix";
import { ROAD_SPEED_REPOSITORY, type RoadSpeedRepository } from "../domain/road-speed.repository";
import { defaultLimitKph, lowestDefaultKph, type RoadLimit } from "../domain/road-speed-limits";
import { armedSpeedLimits, zoneWatchesVehicle } from "../domain/zone-transitions";

export type RoadSpeedAlert = {
  type: "road_speeding";
  severity: "medium" | "high";
  details: Record<string, unknown>;
};

// Far enough over to be dangerous rather than careless.
const HIGH_SEVERITY_OVER_KPH = 30;

/**
 * Road speed limits, alongside zone limits: "street A's limit is 50" rather
 * than "30 in our depot". Inside a zone with its own armed limit the zone
 * decides, so one breach never raises two alerts.
 */
@Injectable()
export class RoadSpeedEvaluatorService {
  constructor(
    @Inject(ROAD_SPEED_REPOSITORY) private readonly roads: RoadSpeedRepository,
    @Inject(GEOFENCE_ZONE_REPOSITORY) private readonly zones: GeofenceZoneRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async evaluate(fix: RoadMatchedFix): Promise<RoadSpeedAlert | null> {
    const limit = await this.limitFor(fix);
    if (!limit || fix.speedKph <= limit.limitKph) return null;
    if (await this.zoneLimitApplies(fix)) return null;

    const { confirmWithinSeconds, alertCooldownMinutes } = this.config.roadSpeed;
    const alert = await this.roads.recordBreach({
      tenantId: fix.tenantId,
      vehicleId: fix.vehicleId,
      at: fix.at,
      confirmWithinSeconds,
      cooldownMinutes: alertCooldownMinutes,
    });
    return alert ? toAlert(fix, limit) : null;
  }

  /** The posted limit when OSM has one, otherwise the default for the road type. */
  private async limitFor(fix: RoadMatchedFix): Promise<RoadLimit | null> {
    if (fix.osmSpeedLimitKph != null) {
      return { limitKph: fix.osmSpeedLimitKph, source: "osm", inTown: null };
    }
    const defaults = this.config.roadSpeed;
    if (fix.speedKph <= lowestDefaultKph(defaults)) return null;
    const inTown = await this.roads.isBuiltUp(fix.point);
    return { limitKph: defaultLimitKph(fix.roadClass, inTown, defaults), source: "default", inTown };
  }

  private async zoneLimitApplies(fix: RoadMatchedFix): Promise<boolean> {
    const positioned = await this.zones.findForPosition(fix.tenantId, fix.point, []);
    const watching = positioned
      .filter((entry) => entry.inside && zoneWatchesVehicle(entry.zone, fix.vehicleId))
      .map(({ zone }) => zone);
    return armedSpeedLimits(watching, fix.at).length > 0;
  }
}

function toAlert(fix: RoadMatchedFix, limit: RoadLimit): RoadSpeedAlert {
  return {
    type: "road_speeding",
    severity: fix.speedKph - limit.limitKph >= HIGH_SEVERITY_OVER_KPH ? "high" : "medium",
    details: {
      roadName: fix.roadName || null,
      roadClass: fix.roadClass,
      speedKph: Math.round(fix.speedKph),
      limitKph: limit.limitKph,
      // "default" limits are ours, not posted; never present one as a sign on the road.
      limitSource: limit.source,
      inTown: limit.inTown,
      lat: fix.point.lat,
      lng: fix.point.lng,
      at: fix.at.toISOString(),
    },
  };
}
