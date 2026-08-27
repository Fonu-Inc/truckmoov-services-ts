import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { getAuthOrm, SecurityEventRecord } from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type {
  SecurityEventFilters,
  SecurityEventPage,
  SecurityEventRepository,
  SecurityEventSeverity,
  StoredSecurityEvent,
} from './security-event.repository';

function toStored(r: SecurityEventRecord): StoredSecurityEvent {
  return {
    id: r.id,
    eventType: r.eventType as StoredSecurityEvent['eventType'],
    severity: r.severity as StoredSecurityEvent['severity'],
    tenantId: r.tenantId,
    summary: r.summary,
    relatedEntityType: r.relatedEntityType,
    relatedEntityId: r.relatedEntityId,
    metadata: r.metadata,
    occurredAt: r.occurredAt,
  };
}

@Injectable()
export class MikroSecurityEventRepository implements SecurityEventRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async save(event: StoredSecurityEvent): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(SecurityEventRecord, event as unknown as SecurityEventRecord);
  }

  async search(filters: SecurityEventFilters): Promise<SecurityEventPage> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const where: Record<string, unknown> = {};
    if (filters.tenantId) where.tenantId = filters.tenantId;
    if (filters.severity) where.severity = filters.severity;
    if (filters.eventType) where.eventType = filters.eventType;
    if (filters.from || filters.to) {
      where.occurredAt = {
        ...(filters.from ? { $gte: filters.from } : {}),
        ...(filters.to ? { $lte: filters.to } : {}),
      };
    }
    const [records, total] = await em.findAndCount(SecurityEventRecord, where, {
      orderBy: { occurredAt: 'desc' },
      limit: filters.limit ?? 50,
      offset: filters.offset ?? 0,
    });
    return { items: records.map(toStored), total };
  }

  async countBySeverity(severity: SecurityEventSeverity, since?: Date): Promise<number> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const where: Record<string, unknown> = { severity };
    if (since) where.occurredAt = { $gte: since };
    return em.count(SecurityEventRecord, where);
  }
}
