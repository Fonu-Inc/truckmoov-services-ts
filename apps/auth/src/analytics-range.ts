export type AnalyticsRange = '7d' | '30d' | '90d' | 'custom';

/** The window a data-bundle analytics chart covers, ending now unless custom says otherwise. */
export function analyticsWindow(range: AnalyticsRange, startDate?: string, endDate?: string): { start: Date; end: Date } {
  const end = new Date();
  if (range === 'custom') {
    return { start: new Date(startDate!), end: endDate ? new Date(endDate) : end };
  }
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  return { start, end };
}
