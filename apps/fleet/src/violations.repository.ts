import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { getFleetOrm } from "./contexts/fleet/shared/infrastructure/persistence/fleet-orm";
import type { RuleEntity, Violation, ViolationRule, ViolationStatus } from "./violations.domain";

export type ViolationFilters = {
  entity?: RuleEntity;
  since?: Date;
  ruleId?: string;
  limit?: number;
};

export interface ViolationsRepository {
  listRules(tenantId: string, entity?: RuleEntity): Promise<ViolationRule[]>;
  findRule(tenantId: string, id: string): Promise<ViolationRule | null>;
  saveRule(rule: ViolationRule): Promise<void>;
  deleteRule(tenantId: string, id: string): Promise<void>;
  /** Every tenant's active rules are few; the engine reads them per fix through a short cache. */
  listActiveRules(tenantId: string): Promise<ViolationRule[]>;
  /** Inserts unless a violation with the same rule, subject and dedupe key exists; true when inserted. */
  insertViolation(violation: Violation, dedupeKey: string): Promise<boolean>;
  listViolations(tenantId: string, filters: ViolationFilters): Promise<Violation[]>;
  findViolation(tenantId: string, id: string): Promise<Violation | null>;
  countViolationsByRule(tenantId: string, since: Date): Promise<Map<string, number>>;
  setViolationStatus(tenantId: string, id: string, status: ViolationStatus): Promise<Violation | null>;
  /** Marks a vehicle over a speeding rule's limit, returning when the unbroken run began. */
  startStreak(tenantId: string, ruleId: string, vehicleId: string, at: Date): Promise<Date>;
  endStreaks(tenantId: string, vehicleId: string, ruleIds: string[]): Promise<void>;
}

export const VIOLATIONS_REPOSITORY = Symbol("VIOLATIONS_REPOSITORY");

type Row = Record<string, unknown>;

function json<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

function toRule(row: Row): ViolationRule {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    entity: row.entity as ViolationRule["entity"],
    name: String(row.name),
    description: row.description == null ? null : String(row.description),
    type: row.type as ViolationRule["type"],
    trigger: json(row.trigger, {}),
    scope: row.scope as ViolationRule["scope"],
    scopeIds: json(row.scope_ids, []),
    schedule: json(row.schedule, { mode: "always" }),
    severity: row.severity as ViolationRule["severity"],
    quota: Number(row.quota),
    quotaPeriod: row.quota_period as ViolationRule["quotaPeriod"],
    repeatThreshold: Number(row.repeat_threshold),
    notify: Boolean(row.notify),
    status: row.status as ViolationRule["status"],
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function toViolation(row: Row): Violation {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    ruleId: String(row.rule_id),
    ruleName: String(row.rule_name),
    entity: row.entity as Violation["entity"],
    type: row.type as Violation["type"],
    driverId: row.driver_id == null ? null : String(row.driver_id),
    vehicleId: row.vehicle_id == null ? null : String(row.vehicle_id),
    recordedValue: String(row.recorded_value),
    threshold: String(row.threshold),
    severity: row.severity as Violation["severity"],
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    occurredAt: new Date(row.occurred_at as string),
    status: row.status as Violation["status"],
    createdAt: new Date(row.created_at as string),
  };
}

@Injectable()
export class MikroViolationsRepository implements ViolationsRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async listRules(tenantId: string, entity?: RuleEntity): Promise<ViolationRule[]> {
    const rows = await this.query(
      `select * from violation_rules where tenant_id = ? ${entity ? "and entity = ?" : ""} order by created_at desc, id`,
      entity ? [tenantId, entity] : [tenantId],
    );
    return rows.map(toRule);
  }

  async findRule(tenantId: string, id: string): Promise<ViolationRule | null> {
    const [row] = await this.query(`select * from violation_rules where tenant_id = ? and id = ?`, [tenantId, id]);
    return row ? toRule(row) : null;
  }

  async saveRule(r: ViolationRule): Promise<void> {
    await this.query(
      `insert into violation_rules (id, tenant_id, entity, name, description, type, trigger, scope, scope_ids, schedule,
         severity, quota, quota_period, repeat_threshold, notify, status, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?::jsonb, ?::jsonb, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict (id) do update set entity = excluded.entity, name = excluded.name, description = excluded.description,
         type = excluded.type, trigger = excluded.trigger, scope = excluded.scope, scope_ids = excluded.scope_ids,
         schedule = excluded.schedule, severity = excluded.severity, quota = excluded.quota,
         quota_period = excluded.quota_period, repeat_threshold = excluded.repeat_threshold, notify = excluded.notify,
         status = excluded.status, updated_at = excluded.updated_at`,
      [
        r.id, r.tenantId, r.entity, r.name, r.description, r.type, JSON.stringify(r.trigger), r.scope,
        JSON.stringify(r.scopeIds), JSON.stringify(r.schedule), r.severity, r.quota, r.quotaPeriod,
        r.repeatThreshold, r.notify, r.status, r.createdAt, r.updatedAt,
      ],
    );
  }

  async deleteRule(tenantId: string, id: string): Promise<void> {
    await this.query(`delete from violation_rules where tenant_id = ? and id = ?`, [tenantId, id]);
  }

  async listActiveRules(tenantId: string): Promise<ViolationRule[]> {
    const rows = await this.query(`select * from violation_rules where tenant_id = ? and status = 'active'`, [tenantId]);
    return rows.map(toRule);
  }

  async insertViolation(v: Violation, dedupeKey: string): Promise<boolean> {
    const rows = await this.query(
      `insert into violations (id, tenant_id, rule_id, rule_name, entity, type, driver_id, vehicle_id, recorded_value,
         threshold, severity, latitude, longitude, occurred_at, status, dedupe_key, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict (tenant_id, rule_id, dedupe_key) do nothing
       returning id`,
      [
        v.id, v.tenantId, v.ruleId, v.ruleName, v.entity, v.type, v.driverId, v.vehicleId, v.recordedValue,
        v.threshold, v.severity, v.latitude, v.longitude, v.occurredAt, v.status, dedupeKey, v.createdAt,
      ],
    );
    return rows.length > 0;
  }

  async listViolations(tenantId: string, f: ViolationFilters): Promise<Violation[]> {
    const where = ["tenant_id = ?"];
    const params: unknown[] = [tenantId];
    if (f.entity) {
      where.push("entity = ?");
      params.push(f.entity);
    }
    if (f.since) {
      where.push("occurred_at >= ?");
      params.push(f.since);
    }
    if (f.ruleId) {
      where.push("rule_id = ?");
      params.push(f.ruleId);
    }
    params.push(f.limit ?? 1000);
    const rows = await this.query(
      `select * from violations where ${where.join(" and ")} order by occurred_at desc, id limit ?`,
      params,
    );
    return rows.map(toViolation);
  }

  async findViolation(tenantId: string, id: string): Promise<Violation | null> {
    const [row] = await this.query(`select * from violations where tenant_id = ? and id = ?`, [tenantId, id]);
    return row ? toViolation(row) : null;
  }

  async countViolationsByRule(tenantId: string, since: Date): Promise<Map<string, number>> {
    const rows = await this.query(
      `select rule_id, count(*)::int as n from violations where tenant_id = ? and occurred_at >= ? group by rule_id`,
      [tenantId, since],
    );
    return new Map(rows.map((row) => [String(row.rule_id), Number(row.n)]));
  }

  async setViolationStatus(tenantId: string, id: string, status: ViolationStatus): Promise<Violation | null> {
    const [row] = await this.query(
      `update violations set status = ? where tenant_id = ? and id = ? returning *`,
      [status, tenantId, id],
    );
    return row ? toViolation(row) : null;
  }

  async startStreak(tenantId: string, ruleId: string, vehicleId: string, at: Date): Promise<Date> {
    const [row] = await this.query(
      `insert into violation_streaks (tenant_id, rule_id, vehicle_id, started_at) values (?, ?, ?, ?)
       on conflict (tenant_id, rule_id, vehicle_id) do update set started_at = violation_streaks.started_at
       returning started_at`,
      [tenantId, ruleId, vehicleId, at],
    );
    return new Date(row.started_at as string);
  }

  async endStreaks(tenantId: string, vehicleId: string, ruleIds: string[]): Promise<void> {
    if (ruleIds.length === 0) return;
    await this.query(
      `delete from violation_streaks where tenant_id = ? and vehicle_id = ? and rule_id in (${ruleIds.map(() => "?").join(", ")})`,
      [tenantId, vehicleId, ...ruleIds],
    );
  }

  private async query(sql: string, params: unknown[]): Promise<Row[]> {
    const orm = await getFleetOrm(this.config.db);
    return orm.em.fork().getConnection().execute<Row[]>(sql, params);
  }
}

/** For the in-memory backend and tests. */
@Injectable()
export class InMemoryViolationsRepository implements ViolationsRepository {
  readonly rules = new Map<string, ViolationRule>();
  readonly violations: Array<Violation & { dedupeKey: string }> = [];
  private readonly streaks = new Map<string, Date>();

  async listRules(tenantId: string, entity?: RuleEntity) {
    return [...this.rules.values()]
      .filter((r) => r.tenantId === tenantId && (!entity || r.entity === entity))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findRule(tenantId: string, id: string) {
    const rule = this.rules.get(id);
    return rule && rule.tenantId === tenantId ? { ...rule } : null;
  }

  async saveRule(rule: ViolationRule) {
    this.rules.set(rule.id, { ...rule });
  }

  async deleteRule(tenantId: string, id: string) {
    if (this.rules.get(id)?.tenantId === tenantId) this.rules.delete(id);
  }

  async listActiveRules(tenantId: string) {
    return [...this.rules.values()].filter((r) => r.tenantId === tenantId && r.status === "active");
  }

  async insertViolation(v: Violation, dedupeKey: string) {
    if (this.violations.some((x) => x.tenantId === v.tenantId && x.ruleId === v.ruleId && x.dedupeKey === dedupeKey)) return false;
    this.violations.push({ ...v, dedupeKey });
    return true;
  }

  async listViolations(tenantId: string, f: ViolationFilters) {
    return this.violations
      .filter((v) => v.tenantId === tenantId && (!f.entity || v.entity === f.entity) && (!f.since || v.occurredAt >= f.since) && (!f.ruleId || v.ruleId === f.ruleId))
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, f.limit ?? 1000);
  }

  async findViolation(tenantId: string, id: string) {
    return this.violations.find((v) => v.tenantId === tenantId && v.id === id) ?? null;
  }

  async countViolationsByRule(tenantId: string, since: Date) {
    const counts = new Map<string, number>();
    for (const v of this.violations) {
      if (v.tenantId === tenantId && v.occurredAt >= since) counts.set(v.ruleId, (counts.get(v.ruleId) ?? 0) + 1);
    }
    return counts;
  }

  async setViolationStatus(tenantId: string, id: string, status: ViolationStatus) {
    const v = this.violations.find((x) => x.tenantId === tenantId && x.id === id);
    if (!v) return null;
    v.status = status;
    return v;
  }

  async startStreak(tenantId: string, ruleId: string, vehicleId: string, at: Date) {
    const key = `${tenantId}:${ruleId}:${vehicleId}`;
    if (!this.streaks.has(key)) this.streaks.set(key, at);
    return this.streaks.get(key)!;
  }

  async endStreaks(tenantId: string, vehicleId: string, ruleIds: string[]) {
    for (const ruleId of ruleIds) this.streaks.delete(`${tenantId}:${ruleId}:${vehicleId}`);
  }
}
