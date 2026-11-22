import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { DriverBehaviorUseCase } from "./contexts/fleet/drivers/application/use-cases/driver-behavior.use-case";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "./contexts/fleet/vehicles/domain/repositories/vehicle.repository";
import {
  DRIVING_SPEED_KPH,
  harshTypesFromAlarm,
  inWindow,
  lagosClock,
  normaliseRuleInput,
  quotaPeriodStart,
  ruleApplies,
  ruleIsLive,
  thresholdLabel,
  type RuleEntity,
  type Violation,
  type ViolationRule,
  type ViolationRuleInput,
  type ViolationStatus,
  type ViolationType,
} from "./violations.domain";
import { VIOLATIONS_REPOSITORY, type ViolationsRepository } from "./violations.repository";

export class ViolationRuleNotFoundError extends Error {
  constructor() {
    super("Violation rule not found");
  }
}

export class ViolationNotFoundError extends Error {
  constructor() {
    super("Violation not found");
  }
}

// shortcut: rules and vehicle drivers are cached per pod for 30s, so a rule edit on another pod takes up to 30s to apply here. Move to a bus-invalidated cache if that matters.
const CACHE_MS = 30_000;
/** Enough history for a monthly quota whatever period the page shows. */
const QUOTA_LOOKBACK_DAYS = 31;

type Fix = {
  tenantId: string;
  vehicleId: string;
  speedKph: number | null;
  latitude: number | null;
  longitude: number | null;
  at: Date;
  alarm?: unknown;
};

type HarshEvent = {
  tenantId: string;
  type: ViolationType;
  vehicleId: string | null;
  driverId: string | null;
  latitude: number | null;
  longitude: number | null;
  at: Date;
  /** Identifies the source event so a redelivery raises nothing new. */
  sourceKey: string;
};

export type Owned = { vehicles: Set<string>; drivers: Set<string> } | null;

export function toRuleView(rule: ViolationRule, violationCount = 0) {
  return {
    id: rule.id,
    entity: rule.entity,
    name: rule.name,
    description: rule.description,
    type: rule.type,
    trigger: rule.trigger,
    threshold: thresholdLabel(rule),
    scope: rule.scope,
    scopeIds: rule.scopeIds,
    schedule: rule.schedule,
    severity: rule.severity,
    quota: rule.quota,
    quotaPeriod: rule.quotaPeriod,
    repeatThreshold: rule.repeatThreshold,
    notify: rule.notify,
    status: rule.status,
    violationCount,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}

export function toViolationView(v: Violation) {
  return {
    id: v.id,
    ruleId: v.ruleId,
    ruleName: v.ruleName,
    entity: v.entity,
    type: v.type,
    driverId: v.driverId,
    vehicleId: v.vehicleId,
    recordedValue: v.recordedValue,
    threshold: v.threshold,
    severity: v.severity,
    latitude: v.latitude,
    longitude: v.longitude,
    occurredAt: v.occurredAt.toISOString(),
    status: v.status,
  };
}

/**
 * Violation rules and the engine that applies them (TD-23). GPS speed drives
 * overspeeding and restricted-hours rules; harsh-driving rules fire only on
 * events a tracker reports or the API records, so they depend on the hardware.
 */
@Injectable()
export class ViolationsService {
  private readonly logger = new Logger(ViolationsService.name);
  private readonly rulesCache = new Map<string, { rules: ViolationRule[]; at: number }>();
  private readonly driverCache = new Map<string, { driverId: string | null; at: number }>();

  constructor(
    @Inject(VIOLATIONS_REPOSITORY) private readonly repo: ViolationsRepository,
    @Inject(VEHICLE_REPOSITORY) private readonly vehicles: VehicleRepository,
    @Inject(DriverBehaviorUseCase) private readonly behavior: DriverBehaviorUseCase,
    @Inject(EVENT_BUS) private readonly bus: EventBus,
  ) {}

  // ─── Rules ──────────────────────────────────────────────────────────────────

  async listRules(tenantId: string, entity?: RuleEntity) {
    const [rules, counts] = await Promise.all([this.repo.listRules(tenantId, entity), this.repo.countViolationsByRule(tenantId, new Date(0))]);
    return rules.map((rule) => toRuleView(rule, counts.get(rule.id) ?? 0));
  }

  async createRule(tenantId: string, input: ViolationRuleInput, now = new Date()) {
    const rule: ViolationRule = { id: randomUUID(), tenantId, ...normaliseRuleInput(input), createdAt: now, updatedAt: now };
    await this.repo.saveRule(rule);
    this.rulesCache.delete(tenantId);
    return toRuleView(rule);
  }

  async updateRule(tenantId: string, id: string, input: ViolationRuleInput, now = new Date()) {
    const existing = await this.repo.findRule(tenantId, id);
    if (!existing) throw new ViolationRuleNotFoundError();
    const rule: ViolationRule = { ...existing, ...normaliseRuleInput(input, existing), updatedAt: now };
    await this.repo.saveRule(rule);
    this.rulesCache.delete(tenantId);
    return toRuleView(rule);
  }

  async deleteRule(tenantId: string, id: string) {
    if (!(await this.repo.findRule(tenantId, id))) throw new ViolationRuleNotFoundError();
    await this.repo.deleteRule(tenantId, id);
    this.rulesCache.delete(tenantId);
  }

  // ─── Violations ─────────────────────────────────────────────────────────────

  async setStatus(tenantId: string, id: string, status: ViolationStatus, owned: Owned) {
    const existing = await this.repo.findViolation(tenantId, id);
    if (!existing || !visible(existing, owned)) throw new ViolationNotFoundError();
    const updated = await this.repo.setViolationStatus(tenantId, id, status);
    if (!updated) throw new ViolationNotFoundError();
    return toViolationView(updated);
  }

  /**
   * What the Violations pages show: recent violations, and per driver (or
   * vehicle) the totals, quota use and whether they are a repeat offender.
   */
  async summary(tenantId: string, entity: RuleEntity, periodDays: number, owned: Owned, now = new Date()) {
    const since = new Date(now.getTime() - periodDays * 86_400_000);
    const lookback = new Date(Math.min(since.getTime(), now.getTime() - QUOTA_LOOKBACK_DAYS * 86_400_000));
    const [all, rules] = await Promise.all([
      this.repo.listViolations(tenantId, { entity, since: lookback, limit: 10_000 }),
      this.repo.listRules(tenantId, entity),
    ]);
    const ruleById = new Map(rules.map((r) => [r.id, r]));
    const scoped = all.filter((v) => visible(v, owned));
    const inPeriod = scoped.filter((v) => v.occurredAt >= since);
    const subjectOf = (v: Violation) => (entity === "drivers" ? v.driverId : v.vehicleId);

    // A subject repeats when any rule's count in its own quota period reaches the rule's repeat threshold.
    const inQuota = (v: Violation, rule: ViolationRule) => v.occurredAt >= quotaPeriodStart(rule.quotaPeriod, now);
    const bySubject = new Map<string, Violation[]>();
    for (const v of scoped) {
      const key = subjectOf(v);
      if (key) bySubject.set(key, [...(bySubject.get(key) ?? []), v]);
    }

    const subjects = [];
    let repeatOffenders = 0;
    for (const [subjectId, list] of bySubject) {
      const recent = list.filter((v) => v.occurredAt >= since);
      let repeats = false;
      for (const rule of rules) {
        if (list.filter((v) => v.ruleId === rule.id && inQuota(v, rule)).length >= rule.repeatThreshold) repeats = true;
      }
      if (repeats) repeatOffenders += 1;
      if (recent.length === 0) continue;

      const typeCounts = new Map<string, number>();
      for (const v of recent) typeCounts.set(v.type, (typeCounts.get(v.type) ?? 0) + 1);
      const latestRule = ruleById.get(list[0].ruleId);
      const quotaUsed = latestRule ? list.filter((v) => v.ruleId === latestRule.id && inQuota(v, latestRule)).length : null;
      subjects.push({
        subjectId,
        total: recent.length,
        critical: recent.filter((v) => v.severity === "critical").length,
        mostFrequent: [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0][0],
        lastAt: recent[0].occurredAt.toISOString(),
        quota: latestRule
          ? { ruleId: latestRule.id, used: quotaUsed!, quota: latestRule.quota, period: latestRule.quotaPeriod, exceeded: quotaUsed! > latestRule.quota }
          : null,
        repeatOffender: repeats,
      });
    }

    return {
      total: inPeriod.length,
      criticalCount: inPeriod.filter((v) => v.severity === "critical").length,
      subjectsWithViolations: subjects.length,
      repeatOffenders,
      subjects: subjects.sort((a, b) => b.total - a.total),
      items: inPeriod.slice(0, 500).map(toViolationView),
    };
  }

  // ─── Engine ─────────────────────────────────────────────────────────────────

  /** One GPS fix: speeding and restricted-hours rules, plus any harsh-driving alarm the tracker sent. */
  async onFix(fix: Fix): Promise<void> {
    const rules = await this.activeRules(fix.tenantId);
    if (rules.length === 0) return;
    const driverId = await this.driverOf(fix.tenantId, fix.vehicleId);
    const subject = { vehicleId: fix.vehicleId, driverId };

    const speeding = rules.filter((r) => r.type === "overspeeding");
    const ended: string[] = [];
    for (const rule of speeding) {
      const over = fix.speedKph !== null && fix.speedKph > (rule.trigger.speedKph ?? Infinity);
      if (!over || !ruleIsLive(rule, fix.at) || !ruleApplies(rule, subject)) {
        ended.push(rule.id);
        continue;
      }
      const started = await this.repo.startStreak(fix.tenantId, rule.id, fix.vehicleId, fix.at);
      if (fix.at.getTime() - started.getTime() >= (rule.trigger.minDurationSeconds ?? 0) * 1000) {
        await this.raise(rule, subject, `${Math.round(fix.speedKph!)} km/h`, fix, `streak:${fix.vehicleId}:${started.toISOString()}`);
      }
    }
    await this.repo.endStreaks(fix.tenantId, fix.vehicleId, ended);

    if (fix.speedKph !== null && fix.speedKph >= DRIVING_SPEED_KPH) {
      for (const rule of rules.filter((r) => r.type === "restricted_hours")) {
        const t = rule.trigger;
        if (!ruleIsLive(rule, fix.at) || !ruleApplies(rule, subject)) continue;
        if (!inWindow(fix.at, t.restrictedStart!, t.restrictedEnd!, t.restrictedDays ?? [])) continue;
        const { date, minutes } = lagosClock(fix.at);
        const local = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
        await this.raise(rule, subject, `Driving at ${local}`, fix, `day:${fix.vehicleId}:${date}`);
      }
    }

    for (const type of harshTypesFromAlarm(fix.alarm)) {
      let sourceKey = `alarm:${fix.vehicleId}:${fix.at.toISOString()}:${type}`;
      if (driverId) {
        const recorded = await this.behavior.recordEvent(fix.tenantId, {
          driverId,
          vehicleId: fix.vehicleId,
          type,
          severity: "medium",
          speedKph: fix.speedKph,
          latitude: fix.latitude,
          longitude: fix.longitude,
          occurredAt: fix.at.toISOString(),
        });
        sourceKey = `event:${recorded.id}`;
      }
      await this.onHarshEvent({ tenantId: fix.tenantId, type, vehicleId: fix.vehicleId, driverId, latitude: fix.latitude, longitude: fix.longitude, at: fix.at, sourceKey });
    }
  }

  /** A harsh-driving behaviour event, from a tracker alarm or recorded through the API. */
  async onHarshEvent(event: HarshEvent): Promise<void> {
    if (!event.type.startsWith("harsh_")) return;
    const rules = (await this.activeRules(event.tenantId)).filter((r) => r.type === event.type);
    const subject = { vehicleId: event.vehicleId, driverId: event.driverId };
    for (const rule of rules) {
      if (!ruleIsLive(rule, event.at) || !ruleApplies(rule, subject)) continue;
      await this.raise(rule, subject, "Reported by device", event, event.sourceKey);
    }
  }

  private async raise(
    rule: ViolationRule,
    subject: { vehicleId: string | null; driverId: string | null },
    recordedValue: string,
    where: { latitude: number | null; longitude: number | null; at: Date },
    dedupeKey: string,
  ): Promise<void> {
    const violation: Violation = {
      id: randomUUID(),
      tenantId: rule.tenantId,
      ruleId: rule.id,
      ruleName: rule.name,
      entity: rule.entity,
      type: rule.type,
      driverId: subject.driverId,
      vehicleId: subject.vehicleId,
      recordedValue,
      threshold: thresholdLabel(rule),
      severity: rule.severity,
      latitude: where.latitude,
      longitude: where.longitude,
      occurredAt: where.at,
      status: "open",
      createdAt: new Date(),
    };
    if (!(await this.repo.insertViolation(violation, dedupeKey)) || !rule.notify) return;
    try {
      await this.bus.publish(`tm.${rule.tenantId}.alert.triggered`, {
        id: randomUUID(),
        type: "alert.triggered",
        version: 1,
        occurred_at: new Date().toISOString(),
        tenant_id: rule.tenantId,
        data: {
          alert_type: "violation",
          severity: rule.severity,
          ...(subject.vehicleId ? { vehicle_id: subject.vehicleId } : {}),
          ...(subject.driverId ? { driver_id: subject.driverId } : {}),
          violation_id: violation.id,
          violation_type: rule.type,
          rule_name: rule.name,
          recorded_value: recordedValue,
          threshold: violation.threshold,
        },
      });
    } catch (error) {
      this.logger.warn(`violation_alert_failed:${violation.id}:${(error as Error).message}`);
    }
  }

  private async activeRules(tenantId: string): Promise<ViolationRule[]> {
    const hit = this.rulesCache.get(tenantId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.rules;
    const rules = await this.repo.listActiveRules(tenantId);
    this.rulesCache.set(tenantId, { rules, at: Date.now() });
    return rules;
  }

  private async driverOf(tenantId: string, vehicleId: string): Promise<string | null> {
    const key = `${tenantId}:${vehicleId}`;
    const hit = this.driverCache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.driverId;
    const vehicle = await this.vehicles.findById(vehicleId, tenantId);
    const driverId = vehicle?.assignedDriverId ?? null;
    this.driverCache.set(key, { driverId, at: Date.now() });
    return driverId;
  }
}

function visible(v: Violation, owned: Owned): boolean {
  if (!owned) return true;
  return (v.vehicleId !== null && owned.vehicles.has(v.vehicleId)) || (v.driverId !== null && owned.drivers.has(v.driverId));
}
