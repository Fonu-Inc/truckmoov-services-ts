import { BadRequestException } from "@nestjs/common";

const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 366;
export const DEFAULT_RANGE_DAYS = 30;

export type AnalyticsRange = {
  /** Start of the first day, ISO. */
  from: string;
  /** End of the last day, ISO. */
  to: string;
  /** Whole days covered, both ends included. */
  days: number;
};

function dayOf(value: string, name: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new BadRequestException(`${name} must be an ISO date`);
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

/**
 * Turns the from/to a report screen sends into whole UTC days. A missing end is
 * today and a missing start is thirty days before the end, so a bare call still
 * answers the default window.
 */
export function parseAnalyticsRange(from?: string, to?: string, now: Date = new Date()): AnalyticsRange {
  const lastDay = to ? dayOf(to, "to") : dayOf(now.toISOString(), "to");
  const firstDay = from ? dayOf(from, "from") : new Date(lastDay.getTime() - (DEFAULT_RANGE_DAYS - 1) * DAY_MS);
  if (firstDay > lastDay) throw new BadRequestException("from must not be after to");

  const days = Math.round((lastDay.getTime() - firstDay.getTime()) / DAY_MS) + 1;
  if (days > MAX_RANGE_DAYS) throw new BadRequestException(`The range must not exceed ${MAX_RANGE_DAYS} days`);

  return {
    from: firstDay.toISOString(),
    to: new Date(lastDay.getTime() + DAY_MS - 1).toISOString(),
    days,
  };
}

export type MonthWindow = { month: string; from: string; to: string };

function monthStart(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 1));
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Calendar months, oldest first, ending with the month that holds `to`; the last one is cut at `to`. */
export function trailingMonthWindows(to: string, count: number): MonthWindow[] {
  const end = new Date(to);
  return Array.from({ length: count }, (_, i) => {
    const start = monthStart(end.getUTCFullYear(), end.getUTCMonth() - (count - 1 - i));
    const last = new Date(monthStart(start.getUTCFullYear(), start.getUTCMonth() + 1).getTime() - 1);
    const cut = last > end ? end : last;
    return {
      month: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`,
      from: start.toISOString(),
      to: cut.toISOString(),
    };
  });
}

/**
 * How many months of a monthly fixed cost a window carries: each calendar month
 * it touches counts the share of that month it covers, so a full month is 1 and
 * a half month is 0.5 whatever the month's length.
 */
export function monthsInWindow(from: string, to: string): number {
  const start = new Date(from);
  const end = new Date(to);
  let months = 0;
  let cursor = monthStart(start.getUTCFullYear(), start.getUTCMonth());
  while (cursor <= end) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth();
    const next = monthStart(year, month + 1);
    const overlapStart = Math.max(cursor.getTime(), start.getTime());
    const overlapEnd = Math.min(next.getTime() - 1, end.getTime());
    months += Math.max(0, (overlapEnd - overlapStart + 1) / DAY_MS / daysInMonth(year, month));
    cursor = next;
  }
  return months;
}
