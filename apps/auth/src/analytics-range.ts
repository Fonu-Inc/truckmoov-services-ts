import { lagosDayKey } from './sim-usage.repository';

export type AnalyticsRange = '7d' | '30d' | '90d' | 'custom';

/**
 * The window a data-bundle analytics chart covers, ending now unless custom says otherwise.
 * Custom dates are whole Lagos days, so startDate = endDate (Today, Yesterday) covers that day.
 */
export function analyticsWindow(range: AnalyticsRange, startDate?: string, endDate?: string): { start: Date; end: Date } {
  const end = new Date();
  if (range === 'custom') {
    const day = (value: string) => lagosDayKey(new Date(value));
    return {
      start: new Date(`${day(startDate!)}T00:00:00.000+01:00`),
      end: endDate ? new Date(`${day(endDate)}T23:59:59.999+01:00`) : end,
    };
  }
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  return { start, end };
}

type RangeQuery = { range?: AnalyticsRange; startDate?: string; endDate?: string };

/**
 * What is wrong with a custom range, or null. A custom range needs a real
 * startDate, and endDate (when sent) must be a real date not before it.
 */
export function analyticsRangeProblem(query: RangeQuery): { field: string; message: string } | null {
  if (query.range !== 'custom') return null;
  const start = query.startDate ? new Date(query.startDate) : null;
  if (!start || Number.isNaN(start.getTime())) {
    return { field: 'startDate', message: 'startDate must be a valid date for a custom range' };
  }
  if (query.endDate === undefined) return null;
  const end = new Date(query.endDate);
  if (Number.isNaN(end.getTime())) return { field: 'endDate', message: 'endDate must be a valid date' };
  if (end < start) return { field: 'endDate', message: 'endDate must not be before startDate' };
  return null;
}
