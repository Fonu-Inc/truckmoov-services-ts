/** Installation days are Lagos days: "today", "upcoming" and "overdue" all follow it. */
export const INSTALLATION_TIME_ZONE = 'Africa/Lagos';

const DAY_MS = 86_400_000;

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: INSTALLATION_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The Lagos calendar date at an instant, as YYYY-MM-DD. */
export function lagosDate(at: Date): string {
  return formatter.format(at);
}

/**
 * The Lagos date at an instant as a stored calendar date. Booked dates are
 * kept as UTC midnight of the day chosen, so this compares with them directly.
 */
export function lagosToday(at: Date): Date {
  return new Date(`${lagosDate(at)}T00:00:00Z`);
}

export function nextCalendarDay(day: Date): Date {
  return new Date(day.getTime() + DAY_MS);
}

/** The instants a Lagos calendar date (YYYY-MM-DD) covers: [start, end). */
export function lagosDayBounds(date: string): { start: Date; end: Date } {
  const start = new Date(`${date}T00:00:00+01:00`);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}
