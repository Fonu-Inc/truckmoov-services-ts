import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AppConfigService } from "@shared/config";
import {
  assessFatigue,
  summarizeFatigue,
  FATIGUE_ANALYSIS_REPOSITORY,
  type FatigueAnalysisRepository,
  type StoredFatigueAnalysis,
} from "../../domain/driver-fatigue";
import {
  BEHAVIOR_EVENT_REPOSITORY,
  type BehaviorEventRepository,
} from "../../domain/driver-behavior";
import { DRIVER_REPOSITORY, type DriverRepository } from "../../domain/repositories/driver.repository";

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class DriverFatigueUseCase {
  constructor(
    @Inject(FATIGUE_ANALYSIS_REPOSITORY) private readonly analyses: FatigueAnalysisRepository,
    @Inject(BEHAVIOR_EVENT_REPOSITORY) private readonly events: BehaviorEventRepository,
    @Inject(DRIVER_REPOSITORY) private readonly drivers: DriverRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  get enabled(): boolean {
    return this.config.drivers.fatigueEnabled;
  }

  /**
   * Off by default. The tab is optional and its inputs are incomplete until
   * driver-facing hardware lands, so an operator must be able to switch it off
   * entirely rather than be shown numbers nobody can stand behind.
   */
  private assertEnabled(): void {
    if (!this.enabled) {
      throw new ServiceUnavailableException("Fatigue detection is not enabled for this deployment");
    }
  }

  async summary(tenantId: string, ownedDriverIds: Set<string> | null = null) {
    this.assertEnabled();
    const [allAnalyses, allDrivers] = await Promise.all([
      this.analyses.findLatestPerDriver(tenantId),
      this.drivers.findAll({ tenantId }),
    ]);

    const drivers = allDrivers.filter(
      (driver) => ownedDriverIds === null || ownedDriverIds.has(driver.id),
    );
    const analyses = allAnalyses.filter(
      (analysis) => ownedDriverIds === null || ownedDriverIds.has(analysis.driverId),
    );

    const byDriver = new Map(drivers.map((driver) => [driver.id, driver.name]));
    return {
      ...summarizeFatigue(analyses),
      driversAnalyzed: analyses.length,
      driversTotal: drivers.length,
      recent: analyses
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map((analysis) => present(analysis, byDriver.get(analysis.driverId) ?? null)),
    };
  }

  async forDriver(tenantId: string, driverId: string) {
    this.assertEnabled();
    const driver = await this.drivers.findById(driverId, tenantId);
    if (!driver) throw new NotFoundException("Driver not found");

    const [latest, history] = await Promise.all([
      this.analyses.findLatestForDriver(tenantId, driverId),
      this.analyses.findHistoryForDriver(tenantId, driverId, 10),
    ]);

    return {
      current: latest ? present(latest, driver.name) : null,
      history: history.map((analysis) => ({
        score: analysis.score,
        riskLevel: analysis.riskLevel,
        analyzedAt: analysis.analyzedAt.toISOString(),
      })),
    };
  }

  /** The Run Analysis button. */
  async run(tenantId: string, driverId: string, drivingMinutes?: number, breakMinutes?: number | null) {
    this.assertEnabled();
    const driver = await this.drivers.findById(driverId, tenantId);
    if (!driver) throw new NotFoundException("Driver not found");

    const since = new Date(Date.now() - DAY_MS);
    const events = await this.events.findAll(tenantId, { driverId, since });

    const inputs = {
      drivingMinutes: drivingMinutes ?? 0,
      longestStintMinutes: drivingMinutes ?? 0,
      breakMinutes: breakMinutes ?? null,
      criticalEvents: events.filter((event) => event.severity === "critical").length,
      harshEvents: events.length,
    };
    const assessment = assessFatigue(inputs);

    const analysis: StoredFatigueAnalysis = {
      id: randomUUID(),
      tenantId,
      driverId,
      score: assessment.score,
      riskLevel: assessment.riskLevel,
      drivingMinutes: inputs.drivingMinutes,
      restCompliance: assessment.restCompliance,
      indicators: assessment.indicators,
      recommendations: assessment.recommendations,
      analysis: assessment.analysis,
      // Always partial until hours-of-service and driver-facing hardware exist.
      dataQuality: "partial",
      analyzedAt: new Date(),
    };
    await this.analyses.save(analysis);

    return present(analysis, driver.name);
  }
}

function present(analysis: StoredFatigueAnalysis, driverName: string | null) {
  return {
    id: analysis.id,
    driverId: analysis.driverId,
    driverName,
    score: analysis.score,
    riskLevel: analysis.riskLevel,
    drivingMinutes: analysis.drivingMinutes,
    restCompliance: analysis.restCompliance,
    indicators: analysis.indicators,
    recommendations: analysis.recommendations,
    analysis: analysis.analysis,
    dataQuality: analysis.dataQuality,
    analyzedAt: analysis.analyzedAt.toISOString(),
  };
}
