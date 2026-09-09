import { BadRequestException } from "@nestjs/common";

/** The windows the analytics screen offers. Anything else is a client bug. */
export const ANALYTICS_PERIOD_DAYS = [1, 2, 7, 30, 90] as const;

export const DEFAULT_ANALYTICS_PERIOD_DAYS = 30;

export function parseAnalyticsPeriodDays(raw?: string | number | null): number {
  if (raw === undefined || raw === null || raw === "") return DEFAULT_ANALYTICS_PERIOD_DAYS;

  const days = Number(raw);
  if (!ANALYTICS_PERIOD_DAYS.includes(days as (typeof ANALYTICS_PERIOD_DAYS)[number])) {
    throw new BadRequestException(`period_days must be one of ${ANALYTICS_PERIOD_DAYS.join(", ")}`);
  }
  return days;
}
