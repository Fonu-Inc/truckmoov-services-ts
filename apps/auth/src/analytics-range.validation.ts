import { BadRequestException } from '@nestjs/common';
import { analyticsRangeProblem } from './analytics-range';

/** A bad custom range is the caller's mistake, so a 400 naming the field rather than a 500 from an invalid date. */
export function assertAnalyticsRange(query: Parameters<typeof analyticsRangeProblem>[0]): void {
  const problem = analyticsRangeProblem(query);
  if (problem) throw new BadRequestException(problem);
}
