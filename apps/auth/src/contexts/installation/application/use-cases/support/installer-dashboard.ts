import { lagosDate, lagosDayBounds } from '@shared/devices';
import type { InstallationOrderStatus } from '@auth/installation/domain/installation-order';
import type {
  ActivityMeasure,
  JobEvent,
  MonthlyCount,
  MonthRange,
} from '@auth/installation/domain/installation-job.reader';

export type StatusCounts = Record<InstallationOrderStatus, number>;

/** Offers are not the installer's jobs until accepted, so they count nowhere here. */
export function dashboardCounters(counts: StatusCounts) {
  const total = Object.entries(counts)
    .filter(([status]) => status !== 'assigned')
    .reduce((sum, [, count]) => sum + count, 0);
  const completed = counts.completed;
  return {
    total,
    completed,
    pending: total - completed - counts.cancelled,
    successRate: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

function shiftMonth(month: string, by: number): string {
  const [year, index] = month.split('-').map(Number);
  return new Date(Date.UTC(year, index - 1 + by, 1)).toISOString().slice(0, 7);
}

const monthStart = (month: string) => lagosDayBounds(`${month}-01`).start;

/** The last `count` Lagos calendar months up to and including the current one, and the instants they span. */
export function lagosMonths(now: Date, count: number): { months: string[]; range: MonthRange } {
  const current = lagosDate(now).slice(0, 7);
  const months = Array.from({ length: count }, (_, i) => shiftMonth(current, i - count + 1));
  return { months, range: { from: monthStart(months[0]), before: monthStart(shiftMonth(current, 1)) } };
}

export function activitySeries(months: string[], measures: Record<ActivityMeasure, MonthlyCount[]>) {
  const lookup = (measure: ActivityMeasure, month: string) =>
    measures[measure].find((row) => row.month === month)?.count ?? 0;
  return months.map((month) => ({
    month,
    completed: lookup('completed', month),
    inProgress: lookup('inProgress', month),
    scheduled: lookup('scheduled', month),
  }));
}

export function toActivityView(event: JobEvent) {
  return { type: event.type, jobId: event.orderId, jobNumber: event.jobNumber, occurredAt: event.occurredAt.toISOString() };
}
