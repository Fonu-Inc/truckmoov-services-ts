import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { findChainBreak, sealAuditEntry, type ChainLink } from "@shared/audit";
import {
  AuditLogRecord,
  getFleetOrm,
} from "./contexts/fleet/shared/infrastructure/persistence/fleet-orm";
import { toHashableAuditEntry } from "./audit-log.repository";
import type { AuditLogFilters, AuditLogRepository, ChainVerification } from "./audit-log.repository";
import type { AuditEntityType, AuditEntry } from "./audit-log.service";

function toEntry(record: AuditLogRecord): AuditEntry {
  return {
    id: record.id,
    tenantId: record.tenantId,
    entityType: record.entityType as AuditEntityType,
    entityId: record.entityId,
    action: record.action,
    actorId: record.actorId,
    metadata: record.metadata ?? {},
    occurredAt: record.occurredAt.toISOString(),
  };
}

@Injectable()
export class MikroAuditLogRepository implements AuditLogRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async append(entry: AuditEntry): Promise<void> {
    const orm = await getFleetOrm(this.config.db);
    // One transaction: the advisory lock sealAuditEntry takes lives until
    // commit, and it is that lock which stops two concurrent appends reading
    // the same head and forking this tenant's chain.
    const em = orm.em.fork();
    await em.transactional(async (tx) => {
      const connection = tx.getConnection();
      const { prevHash, rowHash } = await sealAuditEntry(
        { execute: (sql, params) => connection.execute(sql, params as never) },
        "fleet_audit_logs",
        {
          id: entry.id,
          tenantId: entry.tenantId,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          actorId: entry.actorId ?? null,
          actorRole: null,
          summary: null,
          metadata: entry.metadata ?? {},
          occurredAt: entry.occurredAt,
        },
      );

      tx.persist(
        tx.create(AuditLogRecord, {
          id: entry.id,
          tenantId: entry.tenantId,
          entityType: entry.entityType,
          entityId: entry.entityId,
          action: entry.action,
          actorId: entry.actorId,
          metadata: entry.metadata ?? {},
          occurredAt: new Date(entry.occurredAt),
          prevHash,
          rowHash,
        } as AuditLogRecord),
      );
    });
  }

  async query(tenantId: string, filters: AuditLogFilters): Promise<AuditEntry[]> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();

    const where: Record<string, unknown> = { tenantId };
    if (filters.entityType) where.entityType = filters.entityType;
    if (filters.entityId) where.entityId = filters.entityId;
    if (filters.action) where.action = filters.action;

    const records = await em.find(AuditLogRecord, where as never, {
      orderBy: { occurredAt: "desc" },
      limit: filters.limit ?? 100,
    });
    return records.map(toEntry);
  }

  /**
   * Recomputes every hash in a tenant's chain, in seq order, and reports the
   * first entry that does not verify. Reads the whole chain deliberately: a
   * partial check cannot tell a missing entry from one that was never written.
   */
  async verifyChain(tenantId: string): Promise<ChainVerification> {
    const orm = await getFleetOrm(this.config.db);
    const rows = await orm.em.fork().find(
      AuditLogRecord,
      { tenantId } as never,
      { orderBy: { seq: "asc" } },
    );

    const links: ChainLink[] = rows.map((row) => ({
      ...toHashableAuditEntry(toEntry(row)),
      seq: Number(row.seq),
      prevHash: row.prevHash,
      rowHash: row.rowHash,
    }));

    const firstBreak = findChainBreak(links);
    return { tenantId, entriesChecked: links.length, intact: firstBreak === null, firstBreak };
  }
}

