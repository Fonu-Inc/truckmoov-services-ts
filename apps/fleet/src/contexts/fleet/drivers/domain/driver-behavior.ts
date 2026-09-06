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
  limit?: number;
};

export interface BehaviorEventRepository {
  save(event: StoredBehaviorEvent): Promise<void>;
  findAll(tenantId: string, filters?: BehaviorEventFilters): Promise<StoredBehaviorEvent[]>;
}

export const BEHAVIOR_EVENT_REPOSITORY = Symbol("BEHAVIOR_EVENT_REPOSITORY");

// Each dimension starts at 100 and loses ground per event, weighted by how bad
// the event was. A clean driver scores 100 rather than being unscored: absence
// of events is evidence here, unlike a driver with no telemetry at all.
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

export type BehaviorScores = {
  overall: number;
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

  const overall = Math.round(
    dimensions.braking * DIMENSION_WEIGHT.braking +
      dimensions.speed * DIMENSION_WEIGHT.speed +
      dimensions.acceleration * DIMENSION_WEIGHT.acceleration +
      dimensions.cornering * DIMENSION_WEIGHT.cornering,
  );

  return {
    overall,
    braking: Math.round(dimensions.braking),
    acceleration: Math.round(dimensions.acceleration),
    cornering: Math.round(dimensions.cornering),
    speed: Math.round(dimensions.speed),
    counts,
  };
}

export type DriverRanking = {
  driverId: string;
  driverName: string;
  rank: number;
  eventsRecorded: number;
  scores: BehaviorScores;
  band: string;
};

export function rankDrivers(
  drivers: Array<{ id: string; name: string }>,
  events: StoredBehaviorEvent[],
): DriverRanking[] {
  const byDriver = new Map<string, StoredBehaviorEvent[]>();
  for (const event of events) {
    const bucket = byDriver.get(event.driverId) ?? [];
    bucket.push(event);
    byDriver.set(event.driverId, bucket);
  }

  return drivers
    .map((driver) => {
      const own = byDriver.get(driver.id) ?? [];
      const scores = scoreBehaviorEvents(own);
      return {
        driverId: driver.id,
        driverName: driver.name,
        rank: 0,
        eventsRecorded: own.length,
        scores,
        band: bandFor(scores.overall),
      };
    })
    .sort((a, b) => b.scores.overall - a.scores.overall || a.driverName.localeCompare(b.driverName))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export function bandFor(score: number): string {
  if (score >= 90) return "excellent";
  if (score >= 75) return "good";
  if (score >= 60) return "fair";
  return "poor";
}
