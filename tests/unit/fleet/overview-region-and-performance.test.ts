import { describe, expect, it } from "vitest";
import {
  regionForPosition,
  UNKNOWN_REGION,
} from "../../../apps/fleet/src/contexts/fleet/reports/domain/region-from-position";
import {
  calculateDriverPerformance,
  LATENESS_GRACE_SECONDS,
  PERFORMANCE_WINDOW_DAYS,
  scoreDelivery,
  type JobPunctuality,
} from "../../../apps/fleet/src/contexts/fleet/drivers/domain/driver-performance";

function punctuality(overrides: Partial<JobPunctuality> = {}): JobPunctuality {
  return {
    deadline: "2026-09-01T10:00:00.000Z",
    completedAt: "2026-09-01T09:30:00.000Z",
    trafficAllowanceSeconds: 0,
    latenessSeconds: 0,
    onTime: true,
    ...overrides,
  };
}

describe("Region from last position", () => {
  it("maps a fix to its nearest hub", () => {
    expect(regionForPosition(6.5244, 3.3792)).toBe("Lagos");
    expect(regionForPosition(9.0765, 7.3986)).toBe("Abuja");
    expect(regionForPosition(4.8156, 7.0498)).toBe("Port Harcourt");
    expect(regionForPosition(12.0022, 8.592)).toBe("Kano");
  });

  it("still maps a fix on the outskirts of a hub", () => {
    // Ikorodu, ~35km from the Lagos centroid.
    expect(regionForPosition(6.6194, 3.5105)).toBe("Lagos");
  });

  it("returns Unknown for a fix far from every hub", () => {
    // Mid-Sahara, and a point off the Gulf of Guinea.
    expect(regionForPosition(20.0, 10.0)).toBe(UNKNOWN_REGION);
    expect(regionForPosition(2.0, 1.0)).toBe(UNKNOWN_REGION);
  });

  it("returns Unknown rather than guessing when there is no fix", () => {
    expect(regionForPosition(null, null)).toBe(UNKNOWN_REGION);
    expect(regionForPosition(undefined, 3.3792)).toBe(UNKNOWN_REGION);
    expect(regionForPosition(Number.NaN, Number.NaN)).toBe(UNKNOWN_REGION);
  });
});

describe("Driver performance", () => {
  it("scores an on-time delivery in full", () => {
    expect(scoreDelivery(punctuality())).toBe(1);
    expect(scoreDelivery(punctuality({ onTime: true, latenessSeconds: 0 }))).toBe(1);
  });

  it("scores a late delivery on a slope, not as a pass or fail", () => {
    const halfway = scoreDelivery(
      punctuality({ onTime: false, latenessSeconds: LATENESS_GRACE_SECONDS / 2 }),
    );
    expect(halfway).toBeCloseTo(0.5, 5);

    const slightlyLate = scoreDelivery(punctuality({ onTime: false, latenessSeconds: 600 }));
    expect(slightlyLate).toBeGreaterThan(0.9);
    expect(slightlyLate).toBeLessThan(1);
  });

  it("scores nothing once lateness passes the grace window", () => {
    expect(scoreDelivery(punctuality({ onTime: false, latenessSeconds: LATENESS_GRACE_SECONDS }))).toBe(0);
    expect(scoreDelivery(punctuality({ onTime: false, latenessSeconds: LATENESS_GRACE_SECONDS * 3 }))).toBe(0);
  });

  it("averages recent deliveries into a whole percentage", () => {
    const now = new Date("2026-09-05T00:00:00.000Z");
    const performance = calculateDriverPerformance(
      [
        punctuality({ completedAt: "2026-09-01T09:00:00.000Z" }),
        punctuality({ completedAt: "2026-09-02T09:00:00.000Z" }),
        punctuality({
          completedAt: "2026-09-03T09:00:00.000Z",
          onTime: false,
          latenessSeconds: LATENESS_GRACE_SECONDS / 2,
        }),
      ],
      now,
    );

    expect(performance).toEqual({ score: 83, jobsScored: 3 });
  });

  it("ignores deliveries older than the scoring window", () => {
    const now = new Date("2026-09-05T00:00:00.000Z");
    const stale = new Date(now.getTime() - (PERFORMANCE_WINDOW_DAYS + 5) * 24 * 60 * 60 * 1000);

    const performance = calculateDriverPerformance(
      [
        punctuality({ completedAt: stale.toISOString(), onTime: false, latenessSeconds: LATENESS_GRACE_SECONDS }),
        punctuality({ completedAt: "2026-09-04T09:00:00.000Z" }),
      ],
      now,
    );

    expect(performance).toEqual({ score: 100, jobsScored: 1 });
  });

  // No score is not the same as a score of zero, and the caller must be able to
  // tell a new driver from a bad one.
  it("returns null when there is nothing to score", () => {
    expect(calculateDriverPerformance([])).toBeNull();
    expect(
      calculateDriverPerformance([punctuality({ completedAt: "not-a-date" })], new Date()),
    ).toBeNull();
  });
});
