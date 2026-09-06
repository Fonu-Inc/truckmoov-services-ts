export type QuotaAllowance = {
  limit: number | null;
  used: number;
  remaining: number | null;
  usedPercent: number | null;
  unlimited: boolean;
};

/**
 * The "9 / 10 used" bar every resource page shows.
 *
 * A null limit is unlimited, which is not zero: remaining and usedPercent are
 * null so a client cannot render an unlimited plan as a full bar. Remaining
 * never goes negative — a tenant already over its plan has no headroom, not
 * negative headroom.
 */
export function buildQuotaAllowance(limit: number | null, used: number): QuotaAllowance {
  return {
    limit,
    used,
    remaining: limit === null ? null : Math.max(limit - used, 0),
    usedPercent: limit === null || limit === 0 ? null : Math.round((used / limit) * 100),
    unlimited: limit === null,
  };
}
