import { lagosDate, lagosDayBounds } from '@shared/devices';
import type { InstallationOrderStatus } from '@auth/installation/domain/installation-order';
import type {
  ActivityMeasure,
  JobEvent,
  MonthlyCount,
  MonthRange,
} from '@auth/installation/domain/installation-job.reader';

export type StatusCounts = Record<InstallationOrderStatus, number>;

/** Offers are not the installer's jobs until accepted, so they count toward no total. */
function withoutOffers(counts: StatusCounts): number {
  return Object.entries(counts)
    .filter(([status]) => status !== 'assigned')
    .reduce((sum, [, count]) => sum + count, 0);
}

export function dashboardCounters(counts: StatusCounts) {
  const total = withoutOffers(counts);
  const completed = counts.completed;
  return {
    total,
    completed,
    pending: total - completed - counts.cancelled,
    successRate: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

/** The Installation Jobs counters; unassigned stays while the internal status is still exposed. */
export function jobsPageCounters(counts: StatusCounts) {
  return {
    total: withoutOffers(counts),
    scheduled: counts.scheduled,
    inProgress: counts.in_progress,
    overdue: counts.overdue,
    completed: counts.completed,
    cancelled: counts.cancelled,
    issueReported: counts.issue_reported,
    unassigned: counts.unassigned,
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
