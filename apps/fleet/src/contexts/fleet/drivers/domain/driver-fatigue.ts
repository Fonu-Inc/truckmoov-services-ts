export const FATIGUE_RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
export type FatigueRiskLevel = (typeof FATIGUE_RISK_LEVELS)[number];

export type StoredFatigueAnalysis = {
  id: string;
  tenantId: string;
  driverId: string;
  score: number;
  riskLevel: FatigueRiskLevel;
  drivingMinutes: number;
  restCompliance: number | null;
  indicators: string[];
  recommendations: string[];
  analysis: string;
  /**
   * Whether every input was available. Hours-of-service and lane variance need
   * hardware nobody has bought, so most analyses are "partial" and the tab must
   * say so rather than presenting a guess as a measurement.
   */
  dataQuality: "partial" | "complete";
  analyzedAt: Date;
};

export interface FatigueAnalysisRepository {
  save(analysis: StoredFatigueAnalysis): Promise<void>;
  findLatestForDriver(tenantId: string, driverId: string): Promise<StoredFatigueAnalysis | null>;
  findHistoryForDriver(tenantId: string, driverId: string, limit: number): Promise<StoredFatigueAnalysis[]>;
  findLatestPerDriver(tenantId: string): Promise<StoredFatigueAnalysis[]>;
}

export const FATIGUE_ANALYSIS_REPOSITORY = Symbol("FATIGUE_ANALYSIS_REPOSITORY");

export type FatigueInputs = {
  drivingMinutes: number;
  longestStintMinutes: number;
  breakMinutes: number | null;
  criticalEvents: number;
  harshEvents: number;
};

const CONTINUOUS_DRIVING_LIMIT_MINUTES = 4 * 60;
const DAILY_DRIVING_LIMIT_MINUTES = 10 * 60;

/**
 * Scores fatigue 0-10 from what telemetry can actually evidence: how long the
 * driver has been moving, the longest unbroken stint, and how erratic the
 * driving has been. Nothing here claims to measure alertness.
 */
export function assessFatigue(inputs: FatigueInputs): {
  score: number;
  riskLevel: FatigueRiskLevel;
  restCompliance: number | null;
  indicators: string[];
  recommendations: string[];
  analysis: string;
} {
  const indicators: string[] = [];
  let score = 0;

  if (inputs.drivingMinutes >= DAILY_DRIVING_LIMIT_MINUTES) {
    score += 5;
    indicators.push(`Over ${Math.round(inputs.drivingMinutes / 60)} hours driving recorded today`);
  } else if (inputs.drivingMinutes >= CONTINUOUS_DRIVING_LIMIT_MINUTES) {
    score += 3;
    indicators.push(`${Math.round(inputs.drivingMinutes / 60)} hours driving recorded today`);
  } else if (inputs.drivingMinutes > 0) {
    score += 1;
  }

  // Weighted so the worst case — over the daily limit, unbroken, with critical
  // events — actually reaches 10. A scale that cannot report its own maximum
  // understates the case it exists to flag.
  if (inputs.longestStintMinutes >= CONTINUOUS_DRIVING_LIMIT_MINUTES) {
    score += 3;
    indicators.push(
      `No break in the last ${Math.round(inputs.longestStintMinutes / 60)} hours of driving`,
    );
  }

  if (inputs.criticalEvents > 0) {
    score += 2;
    indicators.push(`${inputs.criticalEvents} critical driving event(s) recorded`);
  } else if (inputs.harshEvents >= 3) {
    score += 1;
    indicators.push(`${inputs.harshEvents} harsh driving events recorded`);
  }

  score = Math.min(10, score);
  const riskLevel = riskLevelFor(score);

  // Rest compliance is derived from observed breaks only. Without an
  // hours-of-service feed there is no duty roster to compare against, so a
  // driver with no recorded break returns null rather than zero.
  const restCompliance =
    inputs.breakMinutes === null
      ? null
      : Math.max(0, Math.min(10, Math.round((inputs.breakMinutes / 45) * 10)));

  return {
    score,
    riskLevel,
    restCompliance,
    indicators,
    recommendations: recommendationsFor(riskLevel, inputs),
    analysis: analysisFor(riskLevel, inputs, indicators),
  };
}

export function riskLevelFor(score: number): FatigueRiskLevel {
  if (score >= 9) return "critical";
  if (score >= 6) return "high";
  if (score >= 4) return "medium";
  return "low";
}

function recommendationsFor(risk: FatigueRiskLevel, inputs: FatigueInputs): string[] {
  if (risk === "critical") {
    return [
      "Mandatory 45-minute rest immediately",
      "Reassign the next leg to a backup driver",
      "Schedule a medical wellness check",
    ];
  }
  if (risk === "high") {
    return [
      "Schedule a 30-minute rest stop within the next hour",
      "Avoid night driving assignments for the next 24 hours",
      "Confirm 8 hours off duty before the next long haul",
    ];
  }
  if (risk === "medium") {
    return [
      "Schedule a short break within the next two hours",
      inputs.criticalEvents > 0
        ? "Review the recorded critical events with the driver"
        : "Keep the next assignment under four hours",
    ];
  }
  return ["No action needed; keep normal break scheduling"];
}

function analysisFor(risk: FatigueRiskLevel, inputs: FatigueInputs, indicators: string[]): string {
  if (indicators.length === 0) {
    return "No fatigue indicators in the recorded driving pattern for this period.";
  }
  const hours = (inputs.drivingMinutes / 60).toFixed(1);
  return (
    `Derived from ${hours} hours of recorded driving and ${inputs.harshEvents} harsh event(s). ` +
    `Risk is ${risk}. Lane variance and reaction time are not measured — no driver-facing hardware is fitted — ` +
    `so this reflects driving duration and event patterns only.`
  );
}

export function summarizeFatigue(analyses: StoredFatigueAnalysis[]) {
  if (analyses.length === 0) {
    return {
      averageScore: null,
      averageRestCompliance: null,
      criticalAlerts: 0,
      highRiskAlerts: 0,
      totalAnalyses: 0,
      byRisk: { low: 0, medium: 0, high: 0, critical: 0 },
    };
  }

  const byRisk = { low: 0, medium: 0, high: 0, critical: 0 };
  let scoreTotal = 0;
  let restTotal = 0;
  let restCount = 0;

  for (const analysis of analyses) {
    byRisk[analysis.riskLevel] += 1;
    scoreTotal += analysis.score;
    if (analysis.restCompliance !== null) {
      restTotal += analysis.restCompliance;
      restCount += 1;
    }
  }

  return {
    averageScore: Math.round(scoreTotal / analyses.length),
    averageRestCompliance: restCount > 0 ? Math.round(restTotal / restCount) : null,
    criticalAlerts: byRisk.critical,
    highRiskAlerts: byRisk.high,
    totalAnalyses: analyses.length,
    byRisk,
  };
}
