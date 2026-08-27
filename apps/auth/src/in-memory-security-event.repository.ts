import { Injectable } from '@nestjs/common';
import type { SecurityEventFilters, SecurityEventPage, SecurityEventRepository, SecurityEventSeverity, StoredSecurityEvent } from './security-event.repository';

@Injectable()
export class InMemorySecurityEventRepository implements SecurityEventRepository {
  private readonly store = new Map<string, StoredSecurityEvent>();

  async save(event: StoredSecurityEvent): Promise<void> {
    this.store.set(event.id, event);
  }

  async search(filters: SecurityEventFilters): Promise<SecurityEventPage> {
    let results = [...this.store.values()];
    if (filters.tenantId) results = results.filter((e) => e.tenantId === filters.tenantId);
    if (filters.severity) results = results.filter((e) => e.severity === filters.severity);
    if (filters.eventType) results = results.filter((e) => e.eventType === filters.eventType);
    if (filters.from) results = results.filter((e) => e.occurredAt >= filters.from!);
    if (filters.to) results = results.filter((e) => e.occurredAt <= filters.to!);
    results = results.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? results.length;
    return { items: results.slice(offset, offset + limit), total: results.length };
  }

  async countBySeverity(severity: SecurityEventSeverity, since?: Date): Promise<number> {
    return [...this.store.values()].filter(
      (e) => e.severity === severity && (!since || e.occurredAt >= since),
    ).length;
  }
}
