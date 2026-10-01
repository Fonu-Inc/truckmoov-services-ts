import { scoreBandFor, type DriverScoreBand } from "./driver-roster";

export const BEHAVIOR_EVENT_TYPES = [
  "harsh_braking",
  "harsh_acceleration",
  "harsh_cornering",
  "overspeeding",
] as const;
export type BehaviorEventType = (typeof BEHAVIOR_EVENT_TYPES)[number];

export const BEHAVIOR_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type BehaviorSeverity = (typeof BEHAVIOR_SEVERITIES)[number];

export type StoredBehaviorEvent = {
  id: string;
  tenantId: string;
  driverId: string;
  vehicleId: string | null;
  type: BehaviorEventType;
  severity: BehaviorSeverity;
  speedKph: number | null;
  latitude: number | null;
  longitude: number | null;
  occurredAt: Date;
  createdAt: Date;
};

export type BehaviorEventFilters = {
  driverId?: string;
  type?: BehaviorEventType;
  severity?: BehaviorSeverity;
  since?: Date;
  // null lifts the cap: scoring must see every event in the window.
  limit?: number | null;
};

export interface BehaviorEventRepository {
  save(event: StoredBehaviorEvent): Promise<void>;
  findAll(tenantId: string, filters?: BehaviorEventFilters): Promise<StoredBehaviorEvent[]>;
}

export const BEHAVIOR_EVENT_REPOSITORY = Symbol("BEHAVIOR_EVENT_REPOSITORY");

// Each dimension starts at 100 and loses ground per event, weighted by how bad
// the event was. A driver with no events in the window is unscored, not a clean
// 100: we cannot tell a careful driver from one whose telemetry never arrived.
const SEVERITY_PENALTY: Record<BehaviorSeverity, number> = {
  low: 2,
  medium: 5,
  high: 9,
  critical: 15,
};

const DIMENSION_BY_TYPE: Record<BehaviorEventType, "braking" | "acceleration" | "cornering" | "speed"> = {
  harsh_braking: "braking",
  harsh_acceleration: "acceleration",
  harsh_cornering: "cornering",
  overspeeding: "speed",
};

// The ranking weights on the Behaviour tab.
const DIMENSION_WEIGHT = { braking: 0.3, speed: 0.3, acceleration: 0.2, cornering: 0.2 } as const;

export const BEHAVIOR_WINDOW_DAYS = 30;

export type BehaviorScores = {
  overall: number | null;
  braking: number;
  acceleration: number;
  cornering: number;
  speed: number;
  counts: {
    hardBrake: number;
    hardAccel: number;
    sharpTurn: number;
    speeding: number;
    total: number;
    critical: number;
  };
};

/** The one behaviour scoring rule. Every route that shows a behaviour score goes through here. */
export function scoreBehaviorEvents(events: StoredBehaviorEvent[]): BehaviorScores {
  const dimensions = { braking: 100, acceleration: 100, cornering: 100, speed: 100 };
  const counts = { hardBrake: 0, hardAccel: 0, sharpTurn: 0, speeding: 0, total: 0, critical: 0 };

  for (const event of events) {
    const dimension = DIMENSION_BY_TYPE[event.type];
    dimensions[dimension] = Math.max(0, dimensions[dimension] - SEVERITY_PENALTY[event.severity]);

    counts.total += 1;
    if (event.severity === "critical") counts.critical += 1;
    if (event.type === "harsh_braking") counts.hardBrake += 1;
    if (event.type === "harsh_acceleration") counts.hardAccel += 1;
    if (event.type === "harsh_cornering") counts.sharpTurn += 1;
    if (event.type === "overspeeding") counts.speeding += 1;
  }

  return {
    overall: events.length > 0 ? weightedOverall(dimensions) : null,
    braking: Math.round(dimensions.braking),
    acceleration: Math.round(dimensions.acceleration),
    cornering: Math.round(dimensions.cornering),
    speed: Math.round(dimensions.speed),
    counts,
  };
}

function weightedOverall(dimensions: Record<keyof typeof DIMENSION_WEIGHT, number>): number {
  return Math.round(
    dimensions.braking * DIMENSION_WEIGHT.braking +
      dimensions.speed * DIMENSION_WEIGHT.speed +
      dimensions.acceleration * DIMENSION_WEIGHT.acceleration +
      dimensions.cornering * DIMENSION_WEIGHT.cornering,
  );
}

/** Scores many drivers from one tenant-wide event read, so a roster is one query, not one per driver. */
export function scoreDrivers(
  driverIds: Iterable<string>,
  events: StoredBehaviorEvent[],
): Map<string, BehaviorScores> {
  const byDriver = new Map<string, StoredBehaviorEvent[]>();
  for (const id of driverIds) byDriver.set(id, []);
  for (const event of events) byDriver.get(event.driverId)?.push(event);

  const scores = new Map<string, BehaviorScores>();
  for (const [id, own] of byDriver) scores.set(id, scoreBehaviorEvents(own));
  return scores;
}

export type DriverRanking = {
  driverId: string;
  driverName: string;
  /** Null for an unscored driver: no events means no position to rank. */
  rank: number | null;
  eventsRecorded: number;
  scores: BehaviorScores;
  band: DriverScoreBand;
};

/** Scored drivers by score, then unscored drivers by name. */
export function rankDrivers(
  drivers: Array<{ id: string; name: string }>,
  events: StoredBehaviorEvent[],
): DriverRanking[] {
  const scores = scoreDrivers(
    drivers.map((driver) => driver.id),
    events,
  );

  const entries = drivers.map((driver) => {
    const own = scores.get(driver.id)!;
    return {
      driverId: driver.id,
      driverName: driver.name,
      eventsRecorded: own.counts.total,
      scores: own,
      band: scoreBandFor(own.overall),
    };
  });

  let rank = 0;
  return entries
    .sort(compareRankings)
    .map((entry) => ({ ...entry, rank: entry.scores.overall === null ? null : ++rank }));
}

function compareRankings(
  a: { driverName: string; scores: BehaviorScores },
  b: { driverName: string; scores: BehaviorScores },
): number {
  const left = a.scores.overall ?? -1;
  const right = b.scores.overall ?? -1;
  return right - left || a.driverName.localeCompare(b.driverName);
}
