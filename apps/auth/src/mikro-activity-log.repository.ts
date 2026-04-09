import { Injectable } from "@nestjs/common";
import type { FilterQuery } from "@mikro-orm/core";
import { ActivityLogRecord, getAuthOrm } from "./contexts/auth/session/infrastructure/persistence/auth-orm";
import { AppConfigService } from "@shared/config";
import type { ActivityLogEntry, ActivityLogQuery } from "./activity-log.types";
import type { ActivityLogRepository } from "./activity-log.repository";

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

    const em = orm.em.fork();
    await em.upsert(ActivityLogRecord, {
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
}

function normalizeLimit(limit?: number) {
  if (!Number.isFinite(limit) || !limit || limit <= 0) {
    return 100;
  }
  return Math.min(limit, 500);
}
