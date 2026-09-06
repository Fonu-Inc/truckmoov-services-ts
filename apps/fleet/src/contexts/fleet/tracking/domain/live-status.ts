/**
 * The four buckets on the map legend and the bottom status bar.
 *
 * Order matters when a vehicle could qualify for two: a vehicle whose device
 * has gone quiet is offline whatever job it was carrying, because the platform
 * cannot say where it is. A vehicle on a job is "in progress" even when it is
 * stationary at a stop, which is why idle is only ever a vehicle with no job.
 */
export const LIVE_VEHICLE_STATUSES = ["active", "in_progress", "idle", "offline"] as const;

export type LiveVehicleStatus = (typeof LIVE_VEHICLE_STATUSES)[number];

export type LiveStatusCounts = Record<LiveVehicleStatus, number>;

/** Below this a vehicle is parked, not driving. GPS noise alone reads as a few kph. */
export const MOVING_SPEED_KPH = 5;

export type LiveStatusInput = {
  lastFixAt: string | null;
  speedKph: number | null;
  hasActiveJob: boolean;
};

export function liveStatusFor(input: LiveStatusInput, offlineAfterMs: number, now = Date.now()): LiveVehicleStatus {
  if (!isReporting(input.lastFixAt, offlineAfterMs, now)) return "offline";
  if (input.hasActiveJob) return "in_progress";
  return (input.speedKph ?? 0) > MOVING_SPEED_KPH ? "active" : "idle";
}

function isReporting(lastFixAt: string | null, offlineAfterMs: number, now: number): boolean {
  if (!lastFixAt) return false;
  const fixedAt = Date.parse(lastFixAt);
  // An unreadable timestamp is not evidence the vehicle is reporting.
  if (Number.isNaN(fixedAt)) return false;
  return now - fixedAt <= offlineAfterMs;
}

export function emptyLiveCounts(): LiveStatusCounts {
  return { active: 0, in_progress: 0, idle: 0, offline: 0 };
}

export function countLiveStatuses(statuses: Iterable<LiveVehicleStatus>): LiveStatusCounts {
  const counts = emptyLiveCounts();
  for (const status of statuses) counts[status] += 1;
  return counts;
}

export function liveCountsEqual(a: LiveStatusCounts, b: LiveStatusCounts): boolean {
  return LIVE_VEHICLE_STATUSES.every((status) => a[status] === b[status]);
}
