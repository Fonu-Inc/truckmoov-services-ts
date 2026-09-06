import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AppConfigService } from "@shared/config";
import {
  GEOFENCE_ZONE_REPOSITORY,
  type GeofenceZoneRepository,
  type StoredGeofenceZone,
} from "../../../../geofence-zone.repository";
import {
  ZONE_OCCUPANCY_REPOSITORY,
  type StoredZoneOccupancy,
  type ZoneOccupancyRepository,
} from "../domain/zone-occupancy.repository";
import { isInsideZone, zoneWatchesVehicle, type Point } from "../domain/zone-geometry";
import {
  diffZoneMembership,
  dwellBreaches,
  zoneAlertsOn,
  zoneIsArmed,
} from "../domain/zone-transitions";

export type GeofenceAlert = {
  type: "geofence_entry" | "geofence_exit" | "geofence_dwell";
  severity: "low" | "medium" | "high";
  tenantId: string;
  vehicleId: string;
  zoneId: string;
  zoneName: string;
  zoneCategory: string;
  details: Record<string, unknown>;
};

const ALERT_TYPE = {
  entered: "geofence_entry",
  exited: "geofence_exit",
  dwelled: "geofence_dwell",
} as const;

/**
 * Decides what a position means for the tenant's geofence zones.
 *
 * Zones were configurable long before anything evaluated them: the entry, exit
 * and dwell toggles on the zone screen had no reader, so `geofence_entry`,
 * `geofence_exit` and `geofence_dwell` were alert types nothing could produce.
 * This is that reader.
 *
 * Distinct from the `GeofenceService` bounding box, which is a single
 * per-vehicle corridor used for route deviation and has nothing to do with the
 * zones an operator draws on the map.
 */
@Injectable()
export class GeofenceEvaluatorService {
  private readonly logger = new Logger(GeofenceEvaluatorService.name);
  private readonly zoneCache = new Map<string, { zones: StoredGeofenceZone[]; expiresAt: number }>();

  constructor(
    @Inject(GEOFENCE_ZONE_REPOSITORY) private readonly zones: GeofenceZoneRepository,
    @Inject(ZONE_OCCUPANCY_REPOSITORY) private readonly occupancy: ZoneOccupancyRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  /**
   * Evaluates one position and returns the alerts it raises.
   *
   * Returning them rather than publishing keeps the geometry testable without a
   * bus, and lets the caller decide what a transition is worth.
   */
  async evaluate(input: {
    tenantId: string;
    vehicleId: string;
    point: Point;
    at?: Date;
  }): Promise<GeofenceAlert[]> {
    const at = input.at ?? new Date();
    const zones = await this.activeZones(input.tenantId);
    if (zones.length === 0) return [];

    const watching = zones.filter((zone) => zoneWatchesVehicle(zone, input.vehicleId));
    const zonesById = new Map(watching.map((zone) => [zone.id, zone]));

    const inside = new Set(
      watching.filter((zone) => isInsideZone(zone, input.point)).map((zone) => zone.id),
    );

    const previous = await this.occupancy.findByVehicle(input.tenantId, input.vehicleId);
    // Only membership of zones this vehicle is watched by is diffed. A zone
    // whose assignment changed must not read as an exit the vehicle never made.
    const held = previous.filter((entry) => zonesById.has(entry.zoneId));
    const { entered, exited } = diffZoneMembership(held, inside);

    await this.recordEntries(input.tenantId, input.vehicleId, entered, at);
    await this.occupancy.exit(input.tenantId, input.vehicleId, exited);

    const stillInside = held.filter((entry) => inside.has(entry.zoneId));
    const dwells = dwellBreaches(stillInside, zonesById, at);
    for (const dwell of dwells) {
      await this.occupancy.markDwellNotified(input.tenantId, input.vehicleId, dwell.zoneId, at);
    }

    return [
      ...this.alertsFor(input, zonesById, entered, "entered", at),
      ...this.alertsFor(input, zonesById, exited, "exited", at),
      ...dwells.flatMap((dwell) =>
        this.alertsFor(input, zonesById, [dwell.zoneId], "dwelled", at, {
          minutesInside: dwell.minutesInside,
        }),
      ),
    ];
  }

  /** Vehicles currently inside each zone, for the zone list's count chip. */
  async occupantCounts(tenantId: string): Promise<Map<string, number>> {
    const counts = await this.occupancy.countByZone(tenantId);
    return new Map(counts.map((entry) => [entry.zoneId, entry.vehicles]));
  }

  async occupants(tenantId: string, zoneId: string): Promise<StoredZoneOccupancy[]> {
    return this.occupancy.listOccupants(tenantId, zoneId);
  }

  private async recordEntries(
    tenantId: string,
    vehicleId: string,
    zoneIds: string[],
    at: Date,
  ): Promise<void> {
    for (const zoneId of zoneIds) {
      await this.occupancy.enter({
        id: randomUUID(),
        tenantId,
        vehicleId,
        zoneId,
        enteredAt: at,
        dwellNotifiedAt: null,
      });
    }
  }

  private alertsFor(
    input: { tenantId: string; vehicleId: string; point: Point },
    zonesById: Map<string, StoredGeofenceZone>,
    zoneIds: string[],
    kind: "entered" | "exited" | "dwelled",
    at: Date,
    extra: Record<string, unknown> = {},
  ): GeofenceAlert[] {
    const alerts: GeofenceAlert[] = [];

    for (const zoneId of zoneIds) {
      const zone = zonesById.get(zoneId);
      if (!zone) continue;
      // Membership is still recorded for a zone that is off duty or not
      // alerting; only the alert is withheld. Otherwise the vehicle would read
      // as newly entering the moment the schedule opened.
      if (!zoneAlertsOn(zone, kind) || !zoneIsArmed(zone, at)) continue;

      alerts.push({
        type: ALERT_TYPE[kind],
        severity: severityFor(zone, kind),
        tenantId: input.tenantId,
        vehicleId: input.vehicleId,
        zoneId: zone.id,
        zoneName: zone.name,
        zoneCategory: zone.category,
        details: {
          zoneId: zone.id,
          zoneName: zone.name,
          zoneCategory: zone.category,
          lat: input.point.lat,
          lng: input.point.lng,
          at: at.toISOString(),
          ...extra,
        },
      });
    }

    return alerts;
  }

  /**
   * Zones change far less often than positions arrive, so they are cached for
   * the same window the overview uses. Archived zones are never loaded.
   */
  private async activeZones(tenantId: string): Promise<StoredGeofenceZone[]> {
    const cached = this.zoneCache.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) return cached.zones;

    try {
      const zones = await this.zones.findAllByTenant(tenantId, { status: "ACTIVE" });
      this.zoneCache.set(tenantId, {
        zones,
        expiresAt: Date.now() + this.config.overview.cacheTtlSeconds * 1000,
      });
      return zones;
    } catch (error) {
      this.logger.warn(
        `geofence_zone_load_failed:${tenantId}:${error instanceof Error ? error.message : "unknown"}`,
      );
      // Serve the stale copy rather than silently reporting that a vehicle left
      // every zone it was in.
      return cached?.zones ?? [];
    }
  }
}

function severityFor(zone: StoredGeofenceZone, kind: "entered" | "exited" | "dwelled"): GeofenceAlert["severity"] {
  // Entering somewhere off-limits is the case worth waking someone for.
  if (zone.category.toLowerCase().includes("restricted")) {
    return kind === "entered" ? "high" : "medium";
  }
  return kind === "dwelled" ? "medium" : "low";
}
