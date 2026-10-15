const lagosDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" });

/** The calendar day in Lagos as YYYY-MM-DD; UTC is still the previous day until 01:00 there. */
export function lagosToday(now = new Date()): string {
  return lagosDay.format(now);
}

/** The Lagos day `days` after today, as YYYY-MM-DD. */
export function lagosDayOffset(days: number, now = new Date()): string {
  const day = new Date(`${lagosToday(now)}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}
