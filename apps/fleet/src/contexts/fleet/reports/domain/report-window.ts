/** Reports count in Lagos time (WAT, UTC+1, no daylight saving). */
const LAGOS_OFFSET_MS = 60 * 60_000;
const HOUR_MS = 3_600_000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const REPORT_PERIODS = ["daily", "weekly"] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

export const TREND_RANGES = ["today", "yesterday", "last_week", "last_month", "last_year"] as const;
export type TrendRange = (typeof TREND_RANGES)[number];

export type ReportWindow = { from: Date; to: Date };
export type TrendBucket = ReportWindow & { label: string };

// A Date whose UTC fields read as Lagos wall-clock time.
const toLocal = (d: Date) => new Date(d.getTime() + LAGOS_OFFSET_MS);
const fromLocal = (d: Date) => new Date(d.getTime() - LAGOS_OFFSET_MS);
const endBefore = (next: Date) => new Date(next.getTime() - 1);

function localMidnight(d: Date, dayShift = 0): Date {
  const l = toLocal(d);
  return fromLocal(new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate() + dayShift)));
}

function localMonthStart(d: Date, monthShift: number): Date {
  const l = toLocal(d);
  return fromLocal(new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth() + monthShift, 1)));
}

/** Today, or Monday of this week, through the end of today. */
export function reportPeriodWindow(period: ReportPeriod, now = new Date()): ReportWindow {
  const daysBack = period === "daily" ? 0 : (toLocal(now).getUTCDay() + 6) % 7;
  return { from: localMidnight(now, -daysBack), to: endBefore(localMidnight(now, 1)) };
}

export function isWithin(iso: string | null | undefined, window: ReportWindow): boolean {
  if (!iso) return false;
  const at = Date.parse(iso);
  return at >= window.from.getTime() && at <= window.to.getTime();
}

function twoHourBuckets(day: Date): TrendBucket[] {
  return Array.from({ length: 8 }, (_, i) => {
    const hour = 8 + i * 2;
    const from = new Date(day.getTime() + hour * HOUR_MS);
    return { label: `${hour}:00`, from, to: endBefore(new Date(from.getTime() + 2 * HOUR_MS)) };
  });
}

function dayBuckets(now: Date): TrendBucket[] {
  return Array.from({ length: 7 }, (_, i) => {
    const from = localMidnight(now, i - 6);
    return { label: WEEKDAYS[toLocal(from).getUTCDay()], from, to: endBefore(localMidnight(now, i - 5)) };
  });
}

function weekBuckets(now: Date): TrendBucket[] {
  return Array.from({ length: 4 }, (_, i) => {
    const lastDay = -(3 - i) * 7;
    const from = localMidnight(now, lastDay - 6);
    const local = toLocal(from);
    const label = `${String(local.getUTCDate()).padStart(2, "0")} ${MONTHS[local.getUTCMonth()]}`;
    return { label, from, to: endBefore(localMidnight(now, lastDay + 1)) };
  });
}

function monthBuckets(now: Date): TrendBucket[] {
  return Array.from({ length: 12 }, (_, i) => {
    const from = localMonthStart(now, i - 11);
    return { label: MONTHS[toLocal(from).getUTCMonth()], from, to: endBefore(localMonthStart(now, i - 10)) };
  });
}

/** The same buckets the Reports trend chart has always drawn, now cut on the server. */
export function trendBuckets(range: TrendRange, now = new Date()): TrendBucket[] {
  switch (range) {
    case "today":
      return twoHourBuckets(localMidnight(now));
    case "yesterday":
      return twoHourBuckets(localMidnight(now, -1));
    case "last_week":
      return dayBuckets(now);
    case "last_month":
      return weekBuckets(now);
    case "last_year":
      return monthBuckets(now);
  }
}
