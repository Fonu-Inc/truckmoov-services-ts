const BILLING_TIME_ZONE = 'Africa/Lagos';
const DAY_MS = 24 * 60 * 60 * 1000;

const lagosFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: BILLING_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Calendar date in Lagos as YYYY-MM-DD. */
export function lagosDate(at: Date): string {
  return lagosFormat.format(at);
}

export function addDaysToDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day) + days * DAY_MS);
  return shifted.toISOString().slice(0, 10);
}
