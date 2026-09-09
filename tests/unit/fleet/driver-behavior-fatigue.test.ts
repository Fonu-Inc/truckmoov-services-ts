import { describe, expect, it } from "vitest";
import {
  bandFor,
  rankDrivers,
  scoreBehaviorEvents,
  type StoredBehaviorEvent,
} from "../../../apps/fleet/src/contexts/fleet/drivers/domain/driver-behavior";
import {
  assessFatigue,
  riskLevelFor,
  summarizeFatigue,
  type StoredFatigueAnalysis,
} from "../../../apps/fleet/src/contexts/fleet/drivers/domain/driver-fatigue";
import { buildLicense } from "../../../apps/fleet/src/contexts/fleet/drivers/application/use-cases/driver-detail.use-case";
import { DriverFatigueUseCase } from "../../../apps/fleet/src/contexts/fleet/drivers/application/use-cases/driver-fatigue.use-case";

function event(overrides: Partial<StoredBehaviorEvent> = {}): StoredBehaviorEvent {
  const now = new Date("2026-09-06T09:00:00.000Z");
  return {
    id: "e1",
    tenantId: "tenant-a",
    driverId: "d1",
    vehicleId: "v1",
    type: "harsh_braking",
    severity: "medium",
    speedKph: 68,
    latitude: null,
    longitude: null,
    occurredAt: now,
    createdAt: now,
    ...overrides,
  };
}

describe("Behaviour scoring", () => {
  // Absence of events is evidence here, unlike a driver with no telemetry.
  it("scores a driver with no events as a clean 100", () => {
    const scores = scoreBehaviorEvents([]);
    expect(scores.overall).toBe(100);
    expect(scores.counts.total).toBe(0);
  });

  it("penalises the dimension the event belongs to", () => {
    const scores = scoreBehaviorEvents([
      event({ type: "harsh_braking", severity: "high" }),
      event({ type: "overspeeding", severity: "critical" }),
    ]);

    expect(scores.braking).toBe(91);
    expect(scores.speed).toBe(85);
    expect(scores.acceleration).toBe(100);
    expect(scores.cornering).toBe(100);
    expect(scores.counts).toMatchObject({ hardBrake: 1, speeding: 1, total: 2, critical: 1 });
  });

  it("weights the overall score braking 30, speed 30, accel 20, cornering 20", () => {
    const scores = scoreBehaviorEvents([event({ type: "harsh_cornering", severity: "critical" })]);
    // Cornering 85 at weight 0.2, everything else 100.
    expect(scores.overall).toBe(97);
  });

  it("never drops a dimension below zero", () => {
    const events = Array.from({ length: 20 }, () => event({ severity: "critical" }));
    expect(scoreBehaviorEvents(events).braking).toBe(0);
  });

  it("bands scores the way the ranking chips do", () => {
    expect(bandFor(94)).toBe("excellent");
    expect(bandFor(80)).toBe("good");
    expect(bandFor(65)).toBe("fair");
    expect(bandFor(40)).toBe("poor");
  });
});

describe("Driver ranking", () => {
  it("ranks by score and includes drivers with no events", () => {
    const ranking = rankDrivers(
      [
        { id: "d1", name: "Ada" },
        { id: "d2", name: "Musa" },
      ],
      [event({ driverId: "d1", severity: "critical" })],
    );

    expect(ranking[0]).toMatchObject({ driverId: "d2", rank: 1, eventsRecorded: 0 });
    expect(ranking[1]).toMatchObject({ driverId: "d1", rank: 2, eventsRecorded: 1 });
  });

  it("breaks a tie by name so the order is stable between requests", () => {
    const ranking = rankDrivers(
      [
        { id: "d2", name: "Musa" },
        { id: "d1", name: "Ada" },
      ],
      [],
    );
    expect(ranking.map((entry) => entry.driverName)).toEqual(["Ada", "Musa"]);
  });
});

describe("Fatigue assessment", () => {
  it("scores a short clean shift as low risk", () => {
    const result = assessFatigue({
      drivingMinutes: 90,
      longestStintMinutes: 90,
      breakMinutes: 45,
      criticalEvents: 0,
      harshEvents: 0,
    });

    expect(result.riskLevel).toBe("low");
    expect(result.indicators).toEqual([]);
    expect(result.restCompliance).toBe(10);
  });

  it("escalates a long unbroken shift with critical events", () => {
    const result = assessFatigue({
      drivingMinutes: 612,
      longestStintMinutes: 612,
      breakMinutes: 0,
      criticalEvents: 2,
      harshEvents: 6,
    });

    expect(result.score).toBeGreaterThanOrEqual(9);
    expect(result.riskLevel).toBe("critical");
    expect(result.recommendations[0]).toMatch(/Mandatory 45-minute rest/);
    expect(result.indicators.join(" ")).toMatch(/No break/);
  });

  it("caps the score at ten", () => {
    const result = assessFatigue({
      drivingMinutes: 1200,
      longestStintMinutes: 1200,
      breakMinutes: 0,
      criticalEvents: 9,
      harshEvents: 40,
    });
    expect(result.score).toBe(10);
  });

  // Without an hours-of-service feed there is no duty roster to compare
  // against, so unknown rest is null rather than a zero that reads as failure.
  it("reports unknown rest compliance as null, not zero", () => {
    const result = assessFatigue({
      drivingMinutes: 200,
      longestStintMinutes: 200,
      breakMinutes: null,
      criticalEvents: 0,
      harshEvents: 0,
    });
    expect(result.restCompliance).toBeNull();
  });

  it("says plainly that lane variance and reaction time are not measured", () => {
    const result = assessFatigue({
      drivingMinutes: 300,
      longestStintMinutes: 300,
      breakMinutes: 20,
      criticalEvents: 0,
      harshEvents: 1,
    });
    expect(result.analysis).toMatch(/not measured/);
  });

  it("maps scores to risk levels", () => {
    expect(riskLevelFor(2)).toBe("low");
    expect(riskLevelFor(4)).toBe("medium");
    expect(riskLevelFor(7)).toBe("high");
    expect(riskLevelFor(9)).toBe("critical");
  });
});

describe("Fatigue summary", () => {
  function analysis(overrides: Partial<StoredFatigueAnalysis> = {}): StoredFatigueAnalysis {
    return {
      id: "a1",
      tenantId: "tenant-a",
      driverId: "d1",
      score: 5,
      riskLevel: "medium",
      drivingMinutes: 300,
      restCompliance: 6,
      indicators: [],
      recommendations: [],
      analysis: "",
      dataQuality: "partial",
      analyzedAt: new Date(),
      ...overrides,
    };
  }

  it("summarises risk distribution and averages", () => {
    const summary = summarizeFatigue([
      analysis({ score: 9, riskLevel: "critical", restCompliance: 2 }),
      analysis({ score: 7, riskLevel: "high", restCompliance: 4 }),
      analysis({ score: 2, riskLevel: "low", restCompliance: null }),
    ]);

    expect(summary.averageScore).toBe(6);
    expect(summary.criticalAlerts).toBe(1);
    expect(summary.highRiskAlerts).toBe(1);
    expect(summary.averageRestCompliance).toBe(3);
    expect(summary.byRisk).toMatchObject({ critical: 1, high: 1, low: 1 });
  });

  it("returns nulls rather than zeros when nothing has been analysed", () => {
    const summary = summarizeFatigue([]);
    expect(summary.averageScore).toBeNull();
    expect(summary.averageRestCompliance).toBeNull();
    expect(summary.totalAnalyses).toBe(0);
  });
});

describe("Licence state", () => {
  it("reports days remaining and a valid state", () => {
    const future = new Date(Date.now() + 200 * 24 * 60 * 60 * 1000).toISOString();
    const licence = buildLicense("DL-1", future);
    expect(licence.state).toBe("valid");
    expect(licence.daysUntilExpiry).toBeGreaterThan(150);
  });

  it("goes negative once a licence has lapsed", () => {
    const past = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString();
    const licence = buildLicense("DL-1", past);
    expect(licence.state).toBe("expired");
    expect(licence.daysUntilExpiry).toBeLessThan(0);
  });

  it("flags a licence expiring inside 30 days", () => {
    const soon = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(buildLicense("DL-1", soon).state).toBe("expiring");
  });

  // Unknown is not valid: a missing expiry must not read as compliant.
  it("treats a missing or unreadable expiry as unknown", () => {
    expect(buildLicense("DL-1", null).state).toBe("unknown");
    expect(buildLicense("DL-1", "not-a-date").state).toBe("unknown");
  });
});

describe("Fatigue summary scoping", () => {
  function analysisFor(driverId: string, score: number): StoredFatigueAnalysis {
    return {
      id: `a-${driverId}`,
      tenantId: "tenant-a",
      driverId,
      score,
      riskLevel: "medium",
      drivingMinutes: 300,
      restCompliance: 5,
      indicators: [],
      recommendations: [],
      analysis: "",
      dataQuality: "partial",
      analyzedAt: new Date(),
    };
  }

  // An owner operator's fatigue tab must not average in, or list, drivers
  // belonging to the rest of the tenant.
  it("summarises only the analyses left after scoping", () => {
    const all = [analysisFor("mine", 8), analysisFor("theirs", 2)];
    const owned = new Set(["mine"]);
    const scoped = all.filter((analysis) => owned.has(analysis.driverId));

    const summary = summarizeFatigue(scoped);
    expect(summary.totalAnalyses).toBe(1);
    expect(summary.averageScore).toBe(8);
  });
});

describe("fatigue feature flag", () => {
  function disabledUseCase() {
    return new DriverFatigueUseCase(
      {} as never,
      {} as never,
      {} as never,
      { drivers: { fatigueEnabled: false } } as never,
    );
  }

  // A 404 and a switched-off feature are different things to the tab: one is a
  // bug, the other is its empty state. The body has to say which.
  it("refuses with a machine-readable 503 when the flag is unset", async () => {
    for (const call of [
      () => disabledUseCase().summary("tenant-1"),
      () => disabledUseCase().forDriver("tenant-1", "driver-1"),
      () => disabledUseCase().run("tenant-1", "driver-1", 240, 15),
    ]) {
      await expect(call()).rejects.toMatchObject({
        status: 503,
        response: { error: "FeatureDisabled", feature: "driver_fatigue" },
      });
    }
  });
});
