export type SimUsageTotals = { totalUsageMb: number; simsCount: number };

export interface SimUsageRepository {
  /** Stored SIM usage summed across every SIM right now. */
  currentTotals(): Promise<SimUsageTotals>;
  /** Writes the day's row, replacing an earlier capture of the same day. */
  saveSnapshot(day: string, totals: SimUsageTotals, capturedAt: Date): Promise<void>;
  /** Snapshots keyed by Lagos day `YYYY-MM-DD`, both ends included. */
  snapshotsBetween(fromDay: string, toDay: string): Promise<Map<string, number>>;
  /** Megabytes in every bundle bought and not cancelled. */
  totalBundleMbBought(): Promise<number>;
}

export const SIM_USAGE_REPOSITORY = Symbol('SIM_USAGE_REPOSITORY');

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export function lagosDayKey(at: Date): string {
  return new Date(at.getTime() + HOUR_MS).toISOString().slice(0, 10);
}

export function shiftDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The last `count` Lagos days ending today, oldest first. */
export function lagosDayWindow(now: Date, count: number): string[] {
  const today = lagosDayKey(now);
  return Array.from({ length: count }, (_, i) => shiftDay(today, i - count + 1));
}
