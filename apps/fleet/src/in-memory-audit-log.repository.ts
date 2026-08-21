import { Injectable } from "@nestjs/common";
import type { AuditLogFilters, AuditLogRepository } from "./audit-log.repository";
import type { AuditEntry } from "./audit-log.service";

@Injectable()
export class InMemoryAuditLogRepository implements AuditLogRepository {
  private readonly entries: AuditEntry[] = [];

  async append(entry: AuditEntry): Promise<void> {
    this.entries.push({ ...entry });
  }

  async query(tenantId: string, filters: AuditLogFilters): Promise<AuditEntry[]> {
    const limit = filters.limit ?? 100;
    return this.entries
      .filter((entry) => {
        if (entry.tenantId !== tenantId) return false;
        if (filters.entityType && entry.entityType !== filters.entityType) return false;
        if (filters.entityId && entry.entityId !== filters.entityId) return false;
        if (filters.action && entry.action !== filters.action) return false;
        return true;
      })
      .slice(-limit)
      .reverse();
  }
}
