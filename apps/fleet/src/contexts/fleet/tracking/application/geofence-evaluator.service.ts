import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
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
import {
  diffZoneMembership,
  dwellBreaches,
  zoneAlertsOn,
  zoneIsArmed,
  zoneSpeedBreach,
  zoneWatchesVehicle,
  type Point,
  type ZoneAlertKind,
} from "../domain/zone-transitions";

export type GeofenceAlert = {
  type: "geofence_entry" | "geofence_exit" | "geofence_dwell" | "geofence_speeding";
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
  speeding: "geofence_speeding",
} as const;

/**
 * Decides what a position means for the tenant's geofence zones.
 *
 * Zones were configurable long before anything evaluated them: the entry, exit
 * and dwell toggles on the zone screen had no reader, so `geofence_entry`,
 * `geofence_exit` and `geofence_dwell` were alert types nothing could produce.
 * This is that reader.
 */
@Injectable()
export class GeofenceEvaluatorService {
  constructor(
    @Inject(GEOFENCE_ZONE_REPOSITORY) private readonly zones: GeofenceZoneRepository,
    @Inject(ZONE_OCCUPANCY_REPOSITORY) private readonly occupancy: ZoneOccupancyRepository,
  ) {}

  /**
   * Evaluates one position and returns the alerts it raises.
   *
   * Returning them rather than publishing keeps the evaluation testable without
   * a bus, and lets the caller decide what a transition is worth. A failed zone
   * lookup throws instead of answering "in no zones", which would raise an exit
   * for every zone the vehicle is in.
   */
  async evaluate(input: {
    tenantId: string;
    vehicleId: string;
    point: Point;
    speedKph?: number | null;
    at?: Date;
  }): Promise<GeofenceAlert[]> {
    const at = input.at ?? new Date();
    const previous = await this.occupancy.findByVehicle(input.tenantId, input.vehicleId);
    const positioned = await this.zones.findForPosition(
      input.tenantId,
      input.point,
      previous.map((entry) => entry.zoneId),
    );
    if (positioned.length === 0) return [];

    const watching = positioned.filter(({ zone }) => zoneWatchesVehicle(zone, input.vehicleId));
    const zonesById = new Map(watching.map(({ zone }) => [zone.id, zone]));
    const inside = new Set(watching.filter((entry) => entry.inside).map(({ zone }) => zone.id));

    // Only membership of zones this vehicle is watched by is diffed. A zone
    // whose assignment changed must not read as an exit the vehicle never made.
    const held = previous.filter((entry) => zonesById.has(entry.zoneId));
    const diff = diffZoneMembership(held, inside);

    // Only the caller whose write landed alerts, so a fix seen twice raises one alert.
    const entered = await this.recordEntries(input.tenantId, input.vehicleId, diff.entered, at);
    const exited = await this.occupancy.exit(input.tenantId, input.vehicleId, diff.exited);

    const stillInside = held.filter((entry) => inside.has(entry.zoneId));
    const breaches = dwellBreaches(stillInside, zonesById, at);
    const claimed = await Promise.all(
      breaches.map((dwell) => this.occupancy.claimDwellAlert(input.tenantId, input.vehicleId, dwell.zoneId, at)),
    );
    const dwells = breaches.filter((_, index) => claimed[index]);

    const speeding = await this.speedingAlerts(input, watching, at);

    return [
      ...this.alertsFor(input, zonesById, entered, "entered", at),
      ...this.alertsFor(input, zonesById, exited, "exited", at),
      ...dwells.flatMap((dwell) =>
        this.alertsFor(input, zonesById, [dwell.zoneId], "dwelled", at, {
          minutesInside: dwell.minutesInside,
        }),
      ),
      ...speeding,
    ];
  }

  /** One alert per stay, against the strictest limit of the zones the vehicle is in. */
  private async speedingAlerts(
    input: { tenantId: string; vehicleId: string; point: Point; speedKph?: number | null },
    watching: Array<{ zone: StoredGeofenceZone; inside: boolean }>,
    at: Date,
  ): Promise<GeofenceAlert[]> {
    const insideZones = watching.filter((entry) => entry.inside).map(({ zone }) => zone);
    const breach = zoneSpeedBreach(insideZones, input.speedKph, at);
    if (!breach) return [];
    if (!(await this.occupancy.claimSpeedingAlert(input.tenantId, input.vehicleId, breach.zone.id, at))) return [];

    const zonesById = new Map([[breach.zone.id, breach.zone]]);
    return this.alertsFor(input, zonesById, [breach.zone.id], "speeding", at, {
      speedKph: input.speedKph,
      limitKph: breach.limitKph,
    });
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
  ): Promise<string[]> {
    const recorded: string[] = [];
    for (const zoneId of zoneIds) {
      const inserted = await this.occupancy.enter({
        id: randomUUID(),
        tenantId,
        vehicleId,
        zoneId,
        enteredAt: at,
        dwellNotifiedAt: null,
        speedingNotifiedAt: null,
      });
      if (inserted) recorded.push(zoneId);
    }
    return recorded;
  }

  private alertsFor(
    input: { tenantId: string; vehicleId: string; point: Point },
    zonesById: Map<string, StoredGeofenceZone>,
    zoneIds: string[],
    kind: ZoneAlertKind,
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
}

function severityFor(zone: StoredGeofenceZone, kind: ZoneAlertKind): GeofenceAlert["severity"] {
  // Entering somewhere off-limits is the case worth waking someone for.
  if (zone.category.toLowerCase().includes("restricted")) {
    return kind === "entered" ? "high" : "medium";
  }
  return kind === "dwelled" || kind === "speeding" ? "medium" : "low";
}
