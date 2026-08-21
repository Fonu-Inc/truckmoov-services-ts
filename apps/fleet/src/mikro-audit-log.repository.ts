import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import {
  AuditLogRecord,
  getFleetOrm,
} from "./contexts/fleet/shared/infrastructure/persistence/fleet-orm";
import type { AuditLogFilters, AuditLogRepository } from "./audit-log.repository";
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
    const em = orm.em.fork();
    em.persist(
      em.create(AuditLogRecord, {
        id: entry.id,
        tenantId: entry.tenantId,
        entityType: entry.entityType,
        entityId: entry.entityId,
        action: entry.action,
        actorId: entry.actorId,
        metadata: entry.metadata ?? {},
        occurredAt: new Date(entry.occurredAt),
      } as AuditLogRecord),
    );
    await em.flush();
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
}
