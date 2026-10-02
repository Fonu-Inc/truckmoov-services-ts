import { Injectable } from "@nestjs/common";
import type { FilterQuery } from "@mikro-orm/core";
import { ActivityLogRecord, getAuthOrm } from "./contexts/auth/session/infrastructure/persistence/auth-orm";
import { AppConfigService } from "@shared/config";
import { findChainBreak, sealAuditEntry, type ChainLink } from "@shared/audit";
import type {
  ActivityLogEntry,
  ActivityLogQuery,
  AuditFilterOptions,
  AuditLogQuery,
} from "./activity-log.types";
import { toHashableActivityEntry } from "./activity-log.repository";
import type { ActivityLogRepository, ChainVerification } from "./activity-log.repository";

@Injectable()
export class MikroActivityLogRepository implements ActivityLogRepository {
  constructor(private readonly config: AppConfigService) {}

  async save(entry: ActivityLogEntry): Promise<void> {
    const orm = await getAuthOrm({
      host: this.config.db.host,
      port: this.config.db.port,
      user: this.config.db.user,
      password: this.config.db.password,
      dbName: this.config.db.dbName,
    });

    // One transaction: sealAuditEntry takes an advisory lock that lives until
    // commit, and it is that lock which stops two concurrent appends reading
    // the same head and forking the tenant's chain. An upsert is no longer
    // possible either — the append-only trigger rejects the update branch.
    const em = orm.em.fork();
    await em.transactional(async (tx) => {
      const connection = tx.getConnection();
      const { prevHash, rowHash } = await sealAuditEntry(
        { execute: (sql, params) => connection.execute(sql, params as never) },
        "activity_logs",
        toHashableActivityEntry(entry),
      );

      tx.persist(
        tx.create(ActivityLogRecord, {
          id: entry.id,
          tenantId: entry.tenantId,
          service: entry.service,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          summary: entry.summary,
          actorId: entry.actorId,
          actorRole: entry.actorRole,
          actorName: entry.actorName,
          actorEmail: entry.actorEmail,
          tenantName: entry.tenantName,
          metadata: entry.metadata,
          occurredAt: new Date(entry.occurredAt),
          recordedAt: new Date(entry.recordedAt),
          prevHash,
          rowHash,
        } as ActivityLogRecord),
      );
    });
  }

  async query(tenantId: string, filters: ActivityLogQuery): Promise<ActivityLogEntry[]> {
    const orm = await getAuthOrm({
      host: this.config.db.host,
      port: this.config.db.port,
      user: this.config.db.user,
      password: this.config.db.password,
      dbName: this.config.db.dbName,
    });

    const em = orm.em.fork();
    const where: FilterQuery<ActivityLogRecord> = { tenantId };
    if (filters.service) where.service = filters.service;
    if (filters.entityType) where.entityType = filters.entityType;
    if (filters.entityId) where.entityId = filters.entityId;
    if (filters.entityId) where.entityId = filters.entityId;
    if (filters.action) where.action = filters.action;
    if (filters.actorId) where.actorId = filters.actorId;

    const rows = await em.find(ActivityLogRecord, where, {
      orderBy: { occurredAt: "desc", recordedAt: "desc" },
      limit: normalizeLimit(filters.limit),
    });

    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      service: row.service,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      summary: row.summary,
      actorId: row.actorId ?? null,
      actorRole: row.actorRole ?? null,
      actorName: row.actorName ?? null,
      actorEmail: row.actorEmail ?? null,
      tenantName: row.tenantName ?? null,
      metadata: row.metadata ?? {},
      occurredAt: row.occurredAt.toISOString(),
      recordedAt: row.recordedAt.toISOString(),
    }));
  }

  /**
   * The cross-tenant audit trail.
   *
   * Filters are applied in the database rather than by loading and sieving:
   * this reads every tenant's rows, so the set it starts from is the whole
   * platform's history.
   */
  async queryAcrossTenants(filters: AuditLogQuery): Promise<ActivityLogEntry[]> {
    const em = await this.em();
    const rows = await em.find(ActivityLogRecord, buildAcrossTenantsWhere(filters), {
      orderBy: { occurredAt: "desc", recordedAt: "desc" },
      limit: limitOrDefault(filters.limit),
    });

    return rows.map(toEntry);
  }

  async countAcrossTenants(filters: AuditLogQuery): Promise<number> {
    const em = await this.em();
    return em.count(ActivityLogRecord, buildAcrossTenantsWhere(filters));
  }

  async filterOptions(): Promise<AuditFilterOptions> {
    const connection = (await this.orm()).em.getConnection();

    const [tenants, actions, resourceTypes, services] = await Promise.all([
      connection.execute<Array<{ tenant_id: string; tenant_name: string | null }>>(
        `select tenant_id, max(tenant_name) as tenant_name
           from activity_logs group by tenant_id order by tenant_id`,
      ),
      connection.execute<Array<{ action: string }>>(
        `select distinct action from activity_logs order by action`,
      ),
      connection.execute<Array<{ entity_type: string }>>(
        `select distinct entity_type from activity_logs order by entity_type`,
      ),
      connection.execute<Array<{ service: string }>>(
        `select distinct service from activity_logs order by service`,
      ),
    ]);

    return {
      tenants: tenants.map((row) => ({
        tenantId: row.tenant_id,
        tenantName: row.tenant_name ?? null,
      })),
      actions: actions.map((row) => row.action),
      resourceTypes: resourceTypes.map((row) => row.entity_type),
      services: services.map((row) => row.service),
    };
  }

  async listChainTenantIds(): Promise<string[]> {
    const connection = (await this.orm()).em.getConnection();
    const rows = await connection.execute<Array<{ tenant_id: string }>>(
      `select distinct tenant_id from activity_logs order by tenant_id`,
    );
    return rows.map((row) => row.tenant_id);
  }

  private async orm() {
    return getAuthOrm({
      host: this.config.db.host,
      port: this.config.db.port,
      user: this.config.db.user,
      password: this.config.db.password,
      dbName: this.config.db.dbName,
    });
  }

  private async em() {
    return (await this.orm()).em.fork();
  }

  /**
   * Recomputes every hash in a tenant's chain, in seq order, and reports the
   * first entry that does not verify. Reads the whole chain deliberately: a
   * partial check cannot tell a missing entry from one that was never written.
   */
  async verifyChain(tenantId: string): Promise<ChainVerification> {
    const orm = await getAuthOrm({
      host: this.config.db.host,
      port: this.config.db.port,
      user: this.config.db.user,
      password: this.config.db.password,
      dbName: this.config.db.dbName,
    });

    const rows = await orm.em.fork().find(
      ActivityLogRecord,
      { tenantId } as FilterQuery<ActivityLogRecord>,
      { orderBy: { seq: "asc" } },
    );

    const links: ChainLink[] = rows.map((row) => ({
      ...toHashableActivityEntry({
        ...row,
        actorId: row.actorId ?? null,
        actorRole: row.actorRole ?? null,
        actorName: row.actorName ?? null,
        actorEmail: row.actorEmail ?? null,
        tenantName: row.tenantName ?? null,
        occurredAt: row.occurredAt.toISOString(),
        recordedAt: row.recordedAt.toISOString(),
      }),
      seq: Number(row.seq),
      prevHash: row.prevHash,
      rowHash: row.rowHash,
    }));

    const firstBreak = findChainBreak(links);
    return { tenantId, entriesChecked: links.length, intact: firstBreak === null, firstBreak };
  }
}

function normalizeLimit(limit?: number) {
  return Math.min(limitOrDefault(limit), 500);
}

function buildAcrossTenantsWhere(filters: AuditLogQuery): FilterQuery<ActivityLogRecord> {
  const where: FilterQuery<ActivityLogRecord> = {};

  if (filters.tenantId !== undefined) where.tenantId = filters.tenantId;
  if (filters.action) where.action = filters.action;
  if (filters.entityType) where.entityType = filters.entityType;
  if (filters.entityId) where.entityId = filters.entityId;
  if (filters.service) where.service = filters.service;
  if (filters.from || filters.to) {
    where.occurredAt = {
      ...(filters.from ? { $gte: filters.from } : {}),
      ...(filters.to ? { $lte: filters.to } : {}),
    };
  }

  const clauses = [actorClause(filters.actor), searchClause(filters.search)].filter(
    (clause) => clause !== null,
  );
  if (clauses.length > 0) where.$and = clauses as never;

  return where;
}

// One box on the screen for id, name or email, because an operator
// chasing a person has whichever of the three they happen to hold.
function actorClause(actor?: string) {
  if (!actor?.trim()) return null;
  const term = `%${actor.trim()}%`;
  return {
    $or: [
      { actorId: { $ilike: term } },
      { actorName: { $ilike: term } },
      { actorEmail: { $ilike: term } },
    ],
  };
}

function searchClause(search?: string) {
  if (!search?.trim()) return null;
  const term = `%${search.trim()}%`;
  return {
    $or: [
      { action: { $ilike: term } },
      { entityType: { $ilike: term } },
      { entityId: { $ilike: term } },
      { summary: { $ilike: term } },
      { actorName: { $ilike: term } },
      { actorEmail: { $ilike: term } },
      { tenantName: { $ilike: term } },
      { tenantId: { $ilike: term } },
      { service: { $ilike: term } },
    ],
  };
}

/** The caller owns the cap; the cross-tenant read takes the limit as given. */
function limitOrDefault(limit?: number) {
  if (!Number.isFinite(limit) || !limit || limit <= 0) {
    return 100;
  }
  return limit;
}

function toEntry(row: ActivityLogRecord): ActivityLogEntry {
  return {
    id: row.id,
    tenantId: row.tenantId,
    service: row.service,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    summary: row.summary,
    actorId: row.actorId ?? null,
    actorRole: row.actorRole ?? null,
    actorName: row.actorName ?? null,
    actorEmail: row.actorEmail ?? null,
    tenantName: row.tenantName ?? null,
    metadata: row.metadata ?? {},
    occurredAt: row.occurredAt.toISOString(),
    recordedAt: row.recordedAt.toISOString(),
  };
}
