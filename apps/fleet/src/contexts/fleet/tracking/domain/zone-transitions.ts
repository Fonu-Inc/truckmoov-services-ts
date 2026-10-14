import type { StoredGeofenceZone } from "../../../../geofence-zone.repository";

export type ZoneOccupancy = {
  zoneId: string;
  enteredAt: Date;
  dwellNotifiedAt: Date | null;
};

export type Point = { lat: number; lng: number };

/** Whether the zone is watching this vehicle at all. Empty means every vehicle. */
export function zoneWatchesVehicle(zone: StoredGeofenceZone, vehicleId: string): boolean {
  return zone.assignedVehicleIds.length === 0 || zone.assignedVehicleIds.includes(vehicleId);
}

export type ZoneTransition =
  | { kind: "entered"; zoneId: string }
  | { kind: "exited"; zoneId: string }
  | { kind: "dwelled"; zoneId: string; minutesInside: number };

/**
 * What changed for one vehicle between the zones it was in and the zones it is
 * in now.
 *
 * Membership is diffed rather than inferred from the last position, because a
 * device that was offline may reappear several zones away and both the exit it
 * missed and the entry it just made are real.
 */
export function diffZoneMembership(
  previous: ZoneOccupancy[],
  currentZoneIds: Set<string>,
): { entered: string[]; exited: string[] } {
  const held = new Set(previous.map((occupancy) => occupancy.zoneId));

  return {
    entered: [...currentZoneIds].filter((zoneId) => !held.has(zoneId)),
    exited: [...held].filter((zoneId) => !currentZoneIds.has(zoneId)),
  };
}

/**
 * Zones the vehicle has now been sitting in for longer than the zone allows.
 *
 * Reported once per stay. Without that, a vehicle parked in a depot would
 * raise a dwell alert on every position for as long as it stayed there.
 */
export function dwellBreaches(
  occupancies: ZoneOccupancy[],
  zonesById: Map<string, StoredGeofenceZone>,
  now: Date,
): Array<{ zoneId: string; minutesInside: number }> {
  const breaches: Array<{ zoneId: string; minutesInside: number }> = [];

  for (const occupancy of occupancies) {
    if (occupancy.dwellNotifiedAt !== null) continue;

    const zone = zonesById.get(occupancy.zoneId);
    if (!zone?.dwellAlertsEnabled || zone.dwellMinutes === null) continue;

    const minutesInside = Math.floor((now.getTime() - occupancy.enteredAt.getTime()) / 60_000);
    if (minutesInside >= zone.dwellMinutes) {
      breaches.push({ zoneId: occupancy.zoneId, minutesInside });
    }
  }

  return breaches;
}

const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/**
 * Whether a zone is watching right now.
 *
 * A zone with a schedule is only armed inside its window — a restricted yard
 * that is out of bounds overnight should not alert on the day shift. A window
 * whose end is before its start crosses midnight.
 */
export function zoneIsArmed(zone: StoredGeofenceZone, at: Date): boolean {
  if (!zone.scheduleEnabled) return true;

  const local = inTimezone(at, zone.scheduleTimezone);
  if (zone.scheduleDays.length > 0) {
    const day = DAY_NAMES[local.getUTCDay()];
    const armedToday = zone.scheduleDays.some((value) => value.trim().toLowerCase().startsWith(day));
    if (!armedToday) return false;
  }

  if (!zone.scheduleStartTime || !zone.scheduleEndTime) return true;

  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  const start = toMinutes(zone.scheduleStartTime);
  const end = toMinutes(zone.scheduleEndTime);
  if (start === null || end === null) return true;

  return start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

/**
 * Shifts an instant into the zone's timezone, then reads it as if it were UTC.
 *
 * A schedule is written in the yard's local time, and the server is not
 * necessarily in it. Falls back to the instant itself when the timezone is
 * missing or unknown rather than silently disarming the zone.
 */
function inTimezone(at: Date, timezone: string | null): Date {
  if (!timezone) return at;
  try {
    return new Date(at.toLocaleString("en-US", { timeZone: timezone }));
  } catch {
    return at;
  }
}

function toMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Whether the zone wants to hear about this kind of change. */
export type ZoneAlertKind = ZoneTransition["kind"] | "speeding";

export function zoneAlertsOn(zone: StoredGeofenceZone, kind: ZoneAlertKind): boolean {
  if (kind === "entered") return zone.entryAlertsEnabled;
  if (kind === "exited") return zone.exitAlertsEnabled;
  if (kind === "speeding") return zone.speedLimitEnabled;
  return zone.dwellAlertsEnabled;
}

/**
 * The zone whose speed limit a vehicle is breaking, if any. Where zones
 * overlap the strictest limit applies; a zone off duty enforces none.
 */
export function zoneSpeedBreach(
  zones: StoredGeofenceZone[],
  speedKph: number | null | undefined,
  at: Date,
): { zone: StoredGeofenceZone; limitKph: number } | null {
  if (speedKph == null) return null;
  const limits = armedSpeedLimits(zones, at);
  if (limits.length === 0) return null;
  const strictest = limits.reduce((a, b) => (b.limitKph < a.limitKph ? b : a));
  return speedKph > strictest.limitKph ? strictest : null;
}

/** Zones enforcing a speed limit right now. */
export function armedSpeedLimits(
  zones: StoredGeofenceZone[],
  at: Date,
): Array<{ zone: StoredGeofenceZone; limitKph: number }> {
  return zones.flatMap((zone) =>
    zone.speedLimitEnabled && zone.speedLimitKph != null && zoneIsArmed(zone, at)
      ? [{ zone, limitKph: zone.speedLimitKph }]
      : [],
  );
}
