import { ACTIVE_JOB_STATUSES } from "../../dispatch/domain/active-job-statuses";
import type { DispatchJob } from "../../dispatch/domain/ports/dispatch-jobs-reader.port";
import type { AnalyticsRange } from "./analytics-range";

export type VehicleUtilizationInput = { id: string; plateNumber: string; make: string | null; model: string; status: string; type: string | null };

export type VehicleUtilizationRow = {
  vehicleId: string;
  plateNumber: string;
  name: string;
  type: string | null;
  status: string;
  completedJobs: number;
  activeJobs: number;
  totalJobs: number;
  revenue: number;
  activeDays: number;
  utilizationPercent: number;
  /** End of the latest job occupancy up to the end of the window; null when none. */
  lastActiveAt: string | null;
};

export type UtilizationDay = { date: string; activeVehicles: number };

const DAY_MS = 86_400_000;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * A job occupies its vehicle from creation until it is delivered; one still
 * running occupies it up to now. Returns the window clipped to the range, or
 * null when the job lies wholly outside it.
 */
function occupiedWindow(job: DispatchJob, range: AnalyticsRange, now: number): { start: number; end: number } | null {
  const rangeStart = Date.parse(range.from);
  const rangeEnd = Date.parse(range.to);
  const start = Date.parse(job.createdAt);
  const end = ACTIVE_JOB_STATUSES.has(job.status) ? now : Date.parse(job.updatedAt);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;

  const clippedStart = Math.max(start, rangeStart);
  const clippedEnd = Math.min(end, rangeEnd);
  return clippedStart <= clippedEnd ? { start: clippedStart, end: clippedEnd } : null;
}

function addDays(days: Set<string>, window: { start: number; end: number }): void {
  const first = Math.floor(window.start / DAY_MS);
  const last = Math.floor(window.end / DAY_MS);
  for (let day = first; day <= last; day++) days.add(String(day));
}

function inRange(iso: string, range: AnalyticsRange): boolean {
  return iso >= range.from && iso <= range.to;
}

export function buildUtilizationRows(
  vehicles: VehicleUtilizationInput[],
  jobs: DispatchJob[],
  range: AnalyticsRange,
  now: number = Date.now(),
): { rows: VehicleUtilizationRow[]; daily: UtilizationDay[] } {
  const jobsByVehicle = new Map<string, DispatchJob[]>();
  for (const job of jobs) {
    if (!job.assignedVehicleId) continue;
    jobsByVehicle.set(job.assignedVehicleId, [...(jobsByVehicle.get(job.assignedVehicleId) ?? []), job]);
  }

  const rangeEnd = Date.parse(range.to);
  const activeByDay = new Map<string, number>();
  const rows = vehicles.map((vehicle) => {
    const vehicleJobs = jobsByVehicle.get(vehicle.id) ?? [];
    const days = new Set<string>();
    let touching = 0;
    let lastActive: number | null = null;
    for (const job of vehicleJobs) {
      const start = Date.parse(job.createdAt);
      const end = ACTIVE_JOB_STATUSES.has(job.status) ? now : Date.parse(job.updatedAt);
      if (start <= rangeEnd && !Number.isNaN(end)) lastActive = Math.max(lastActive ?? 0, Math.min(end, rangeEnd));
      const window = occupiedWindow(job, range, now);
      if (!window) continue;
      touching++;
      addDays(days, window);
    }
    for (const day of days) activeByDay.set(day, (activeByDay.get(day) ?? 0) + 1);
    const delivered = vehicleJobs.filter((job) => job.status === "delivered" && inRange(job.updatedAt, range));
    const activeDays = Math.min(days.size, range.days);
    return {
      vehicleId: vehicle.id,
      plateNumber: vehicle.plateNumber,
      name: [vehicle.make, vehicle.model].filter(Boolean).join(" ").trim() || vehicle.plateNumber,
      type: vehicle.type,
      status: vehicle.status,
      completedJobs: delivered.length,
      activeJobs: vehicleJobs.filter((job) => ACTIVE_JOB_STATUSES.has(job.status)).length,
      totalJobs: touching,
      revenue: delivered.reduce((sum, job) => sum + (job.amountNgn ?? 0), 0),
      activeDays,
      utilizationPercent: round1((activeDays / range.days) * 100),
      lastActiveAt: lastActive === null ? null : new Date(lastActive).toISOString(),
    };
  });

  const firstDay = Math.floor(Date.parse(range.from) / DAY_MS);
  const daily = Array.from({ length: range.days }, (_, i) => ({
    date: new Date((firstDay + i) * DAY_MS).toISOString().slice(0, 10),
    activeVehicles: activeByDay.get(String(firstDay + i)) ?? 0,
  }));
  return { rows, daily };
}

export function summarizeUtilization(rows: VehicleUtilizationRow[]) {
  const average = rows.length > 0 ? rows.reduce((sum, row) => sum + row.utilizationPercent, 0) / rows.length : 0;
  return {
    fleetSize: rows.length,
    avgUtilizationPercent: round1(average),
    idleVehicles: rows.filter((row) => row.totalJobs === 0).length,
    fleetRevenue: rows.reduce((sum, row) => sum + row.revenue, 0),
    highCount: rows.filter((row) => row.utilizationPercent > 70).length,
    mediumCount: rows.filter((row) => row.utilizationPercent >= 30 && row.utilizationPercent <= 70).length,
    lowCount: rows.filter((row) => row.utilizationPercent < 30).length,
  };
}
