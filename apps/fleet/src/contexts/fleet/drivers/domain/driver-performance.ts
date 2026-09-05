export type JobPunctuality = {
  deadline: string;
  completedAt: string;
  trafficAllowanceSeconds: number;
  latenessSeconds: number;
  onTime: boolean;
};

export type DriverPerformance = {
  score: number;
  jobsScored: number;
};

// How late a delivery can be, beyond the traffic-widened deadline, before it
// scores nothing at all. Between on-time and this, the job scores on a slope:
// ten minutes late and two hours late are not the same failure.
export const LATENESS_GRACE_SECONDS = 2 * 60 * 60;

// Jobs older than this stop counting. A score is a statement about a driver now,
// not an average over their whole history.
export const PERFORMANCE_WINDOW_DAYS = 90;

/**
 * Scores one delivery from 0 to 1. The deadline is widened by the traffic the
 * drive actually met, so a driver is measured against the road they had rather
 * than an empty one.
 */
export function scoreDelivery(punctuality: JobPunctuality): number {
  if (punctuality.onTime || punctuality.latenessSeconds <= 0) return 1;
  if (punctuality.latenessSeconds >= LATENESS_GRACE_SECONDS) return 0;
  return 1 - punctuality.latenessSeconds / LATENESS_GRACE_SECONDS;
}

/**
 * A driver's score is the mean of their recent scored deliveries, as a whole
 * percentage. A driver with no deadline-bearing deliveries has no score — that
 * is different from scoring zero, and the caller must keep the distinction.
 */
export function calculateDriverPerformance(
  punctualities: JobPunctuality[],
  now: Date = new Date(),
): DriverPerformance | null {
  const cutoff = now.getTime() - PERFORMANCE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const scored = punctualities.filter((entry) => {
    const completedAt = Date.parse(entry.completedAt);
    return Number.isFinite(completedAt) && completedAt >= cutoff;
  });

  if (scored.length === 0) return null;

  const total = scored.reduce((sum, entry) => sum + scoreDelivery(entry), 0);
  return {
    score: Math.round((total / scored.length) * 100),
    jobsScored: scored.length,
  };
}
