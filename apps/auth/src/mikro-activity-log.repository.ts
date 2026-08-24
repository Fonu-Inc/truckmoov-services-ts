import { Injectable } from "@nestjs/common";
import type { FilterQuery } from "@mikro-orm/core";
import { ActivityLogRecord, getAuthOrm } from "./contexts/auth/session/infrastructure/persistence/auth-orm";
import { AppConfigService } from "@shared/config";
import { findChainBreak, sealAuditEntry, type ChainLink } from "@shared/audit";
import type { ActivityLogEntry, ActivityLogQuery } from "./activity-log.types";
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
      metadata: row.metadata ?? {},
      occurredAt: row.occurredAt.toISOString(),
      recordedAt: row.recordedAt.toISOString(),
    }));
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
  if (!Number.isFinite(limit) || !limit || limit <= 0) {
    return 100;
  }
  return Math.min(limit, 500);
}
