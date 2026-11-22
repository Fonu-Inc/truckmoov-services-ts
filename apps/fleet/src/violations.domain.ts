import { lagosToday } from "./utils/lagos-date";

export const VIOLATION_TYPES = [
  "overspeeding",
  "harsh_braking",
  "harsh_acceleration",
  "harsh_cornering",
  "restricted_hours",
] as const;
export type ViolationType = (typeof VIOLATION_TYPES)[number];

export const VIOLATION_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type ViolationSeverity = (typeof VIOLATION_SEVERITIES)[number];

export const RULE_ENTITIES = ["drivers", "vehicles"] as const;
export type RuleEntity = (typeof RULE_ENTITIES)[number];

export const RULE_SCOPES = ["all_drivers", "selected_drivers", "all_vehicles", "selected_vehicles"] as const;
export type RuleScope = (typeof RULE_SCOPES)[number];

export const QUOTA_PERIODS = ["daily", "weekly", "monthly"] as const;
export type QuotaPeriod = (typeof QUOTA_PERIODS)[number];

export const RULE_STATUSES = ["active", "inactive"] as const;
export type RuleStatus = (typeof RULE_STATUSES)[number];

export const VIOLATION_STATUSES = ["open", "under_review", "resolved"] as const;
export type ViolationStatus = (typeof VIOLATION_STATUSES)[number];

export const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];

/** What sets a rule off. Only the fields for the rule's type are kept. */
export type RuleTrigger = {
  speedKph?: number;
  minDurationSeconds?: number;
  /** Harsh-driving rules: kept for display; devices report the event, not a g-force we can compare. */
  thresholdG?: number;
  restrictedStart?: string;
  restrictedEnd?: string;
  restrictedDays?: WeekDay[];
};

export type RuleSchedule =
  | { mode: "always" }
  | { mode: "scheduled"; days: WeekDay[]; start: string; end: string };

export type ViolationRule = {
  id: string;
  tenantId: string;
  entity: RuleEntity;
  name: string;
  description: string | null;
  type: ViolationType;
  trigger: RuleTrigger;
  scope: RuleScope;
  scopeIds: string[];
  schedule: RuleSchedule;
  severity: ViolationSeverity;
  quota: number;
  quotaPeriod: QuotaPeriod;
  repeatThreshold: number;
  notify: boolean;
  status: RuleStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type Violation = {
  id: string;
  tenantId: string;
  ruleId: string;
  ruleName: string;
  entity: RuleEntity;
  type: ViolationType;
  driverId: string | null;
  vehicleId: string | null;
  recordedValue: string;
  threshold: string;
  severity: ViolationSeverity;
  latitude: number | null;
  longitude: number | null;
  occurredAt: Date;
  status: ViolationStatus;
  createdAt: Date;
};

export class ViolationRuleInputError extends Error {
  constructor(readonly field: string, message: string) {
    super(message);
  }
}

export type ViolationRuleInput = Partial<{
  entity: unknown;
  name: unknown;
  description: unknown;
  type: unknown;
  trigger: unknown;
  scope: unknown;
  scopeIds: unknown;
  schedule: unknown;
  severity: unknown;
  quota: unknown;
  quotaPeriod: unknown;
  repeatThreshold: unknown;
  notify: unknown;
  status: unknown;
}>;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function oneOf<T extends string>(field: string, value: unknown, allowed: readonly T[]): T {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value as T;
  throw new ViolationRuleInputError(field, `${field} must be one of: ${allowed.join(", ")}`);
}

function wholeNumber(field: string, value: unknown, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new ViolationRuleInputError(field, `${field} must be a whole number from ${min} to ${max}`);
  return n;
}

function time(field: string, value: unknown): string {
  if (typeof value === "string" && TIME.test(value)) return value;
  throw new ViolationRuleInputError(field, `${field} must be a time like 06:00`);
}

function days(field: string, value: unknown): WeekDay[] {
  if (!Array.isArray(value) || value.length === 0) throw new ViolationRuleInputError(field, `${field} needs at least one day`);
  return [...new Set(value.map((d) => oneOf(field, d, WEEK_DAYS)))];
}

function trigger(type: ViolationType, value: unknown): RuleTrigger {
  const t = (value ?? {}) as Record<string, unknown>;
  switch (type) {
    case "overspeeding":
      return {
        speedKph: wholeNumber("trigger.speedKph", t.speedKph, 1, 300),
        minDurationSeconds: wholeNumber("trigger.minDurationSeconds", t.minDurationSeconds ?? 0, 0, 3600),
      };
    case "restricted_hours":
      return {
        restrictedStart: time("trigger.restrictedStart", t.restrictedStart),
        restrictedEnd: time("trigger.restrictedEnd", t.restrictedEnd),
        restrictedDays: days("trigger.restrictedDays", t.restrictedDays ?? [...WEEK_DAYS]),
      };
    default: {
      const g = t.thresholdG == null ? undefined : Number(t.thresholdG);
      if (g !== undefined && !(g > 0 && g <= 5)) throw new ViolationRuleInputError("trigger.thresholdG", "trigger.thresholdG must be between 0 and 5");
      return g === undefined ? {} : { thresholdG: g };
    }
  }
}

function schedule(value: unknown): RuleSchedule {
  const s = (value ?? { mode: "always" }) as Record<string, unknown>;
  if (s.mode === "always") return { mode: "always" };
  if (s.mode !== "scheduled") throw new ViolationRuleInputError("schedule.mode", "schedule.mode must be always or scheduled");
  return { mode: "scheduled", days: days("schedule.days", s.days), start: time("schedule.start", s.start), end: time("schedule.end", s.end) };
}

/** Validates a create (no `existing`) or a partial update, returning the rule's fields. */
export function normaliseRuleInput(input: ViolationRuleInput, existing?: ViolationRule) {
  const pick = <K extends keyof ViolationRuleInput>(key: K) => (input[key] === undefined ? existing?.[key as keyof ViolationRule] : input[key]);

  const entity = oneOf("entity", pick("entity"), RULE_ENTITIES);
  const name = String(pick("name") ?? "").trim();
  if (!name || name.length > 80) throw new ViolationRuleInputError("name", "Rule name is required (at most 80 characters)");
  const description = String(pick("description") ?? "").trim();
  if (description.length > 240) throw new ViolationRuleInputError("description", "Description must be at most 240 characters");
  const type = oneOf("type", pick("type"), VIOLATION_TYPES);
  const scope = oneOf("scope", pick("scope"), RULE_SCOPES);
  if (!scope.endsWith(entity)) throw new ViolationRuleInputError("scope", `A ${entity} rule must use an ${entity} scope`);
  const rawIds = pick("scopeIds") ?? [];
  if (!Array.isArray(rawIds) || rawIds.some((id) => typeof id !== "string")) throw new ViolationRuleInputError("scopeIds", "scopeIds must be a list of ids");
  const scopeIds = scope.startsWith("selected") ? [...new Set(rawIds as string[])] : [];
  if (scope.startsWith("selected") && scopeIds.length === 0) throw new ViolationRuleInputError("scopeIds", "Pick at least one to apply the rule to");

  return {
    entity,
    name,
    description: description || null,
    type,
    trigger: trigger(type, input.trigger === undefined && existing?.type === type ? existing.trigger : input.trigger),
    scope,
    scopeIds,
    schedule: schedule(pick("schedule")),
    severity: oneOf("severity", pick("severity"), VIOLATION_SEVERITIES),
    quota: wholeNumber("quota", pick("quota") ?? 10, 1, 10000),
    quotaPeriod: oneOf("quotaPeriod", pick("quotaPeriod") ?? "monthly", QUOTA_PERIODS),
    repeatThreshold: wholeNumber("repeatThreshold", pick("repeatThreshold") ?? 5, 1, 10000),
    notify: (pick("notify") ?? true) === true,
    status: oneOf("status", pick("status") ?? "active", RULE_STATUSES),
  };
}

const lagosParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Lagos",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** The Lagos weekday and minutes past midnight for a moment. */
export function lagosClock(at: Date): { day: WeekDay; minutes: number; date: string } {
  const parts = Object.fromEntries(lagosParts.formatToParts(at).map((p) => [p.type, p.value]));
  return { day: parts.weekday as WeekDay, minutes: Number(parts.hour) * 60 + Number(parts.minute), date: lagosToday(at) };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Whether `at` falls in a daily window on the given days; a window like 23:00–05:00 runs past midnight into the next day. */
export function inWindow(at: Date, start: string, end: string, onDays: readonly WeekDay[]): boolean {
  const { day, minutes } = lagosClock(at);
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s === e) return onDays.includes(day);
  if (s < e) return onDays.includes(day) && minutes >= s && minutes < e;
  if (minutes >= s) return onDays.includes(day);
  if (minutes < e) {
    const yesterday = WEEK_DAYS[(WEEK_DAYS.indexOf(day) + 6) % 7];
    return onDays.includes(yesterday);
  }
  return false;
}

export function ruleIsLive(rule: ViolationRule, at: Date): boolean {
  if (rule.status !== "active") return false;
  return rule.schedule.mode === "always" || inWindow(at, rule.schedule.start, rule.schedule.end, rule.schedule.days);
}

/** Whether a rule covers this vehicle and its driver. A driver rule needs a driver to blame. */
export function ruleApplies(rule: ViolationRule, subject: { vehicleId: string | null; driverId: string | null }): boolean {
  switch (rule.scope) {
    case "all_vehicles":
      return subject.vehicleId !== null;
    case "selected_vehicles":
      return subject.vehicleId !== null && rule.scopeIds.includes(subject.vehicleId);
    case "all_drivers":
      return subject.driverId !== null;
    case "selected_drivers":
      return subject.driverId !== null && rule.scopeIds.includes(subject.driverId);
  }
}

/** Moving faster than this counts as driving for restricted-hours rules. */
export const DRIVING_SPEED_KPH = 5;

/**
 * Device alarm names, as Traccar normalises them, for harsh-driving events.
 * Only trackers with an accelerometer that report these raise harsh-driving violations.
 */
const ALARM_TYPES: Record<string, "harsh_braking" | "harsh_acceleration" | "harsh_cornering"> = {
  hardbraking: "harsh_braking",
  hardacceleration: "harsh_acceleration",
  hardcornering: "harsh_cornering",
};

/** The harsh-driving type a device alarm reports, if any; a position can carry several alarms, comma-separated. */
export function harshTypesFromAlarm(alarm: unknown): Array<"harsh_braking" | "harsh_acceleration" | "harsh_cornering"> {
  if (typeof alarm !== "string" || !alarm) return [];
  return [...new Set(alarm.split(",").map((a) => ALARM_TYPES[a.trim().toLowerCase()]).filter((t) => t !== undefined))];
}

export function thresholdLabel(rule: ViolationRule): string {
  const t = rule.trigger;
  switch (rule.type) {
    case "overspeeding":
      return `${t.speedKph} km/h`;
    case "restricted_hours":
      return `${t.restrictedStart}–${t.restrictedEnd}`;
    default:
      return t.thresholdG === undefined ? "Device alarm" : `${t.thresholdG} g`;
  }
}

/** Start of the rule's current quota period (Lagos calendar), for counting violations against the quota. */
export function quotaPeriodStart(period: QuotaPeriod, now: Date): Date {
  const today = lagosToday(now);
  const start = new Date(`${today}T00:00:00+01:00`);
  if (period === "weekly") {
    const offset = (WEEK_DAYS.indexOf(lagosClock(now).day) + 7) % 7;
    start.setUTCDate(start.getUTCDate() - offset);
  }
  if (period === "monthly") return new Date(`${today.slice(0, 8)}01T00:00:00+01:00`);
  return start;
}
