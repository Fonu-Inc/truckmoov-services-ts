import { Injectable } from "@nestjs/common";
import type { ActivityLogEntry, ActivityLogQuery } from "./activity-log.types";
import type { ActivityLogRepository } from "./activity-log.repository";

@Injectable()
export class InMemoryActivityLogRepository implements ActivityLogRepository {
  private readonly entries: ActivityLogEntry[] = [];

  async save(entry: ActivityLogEntry): Promise<void> {
    this.entries.push({ ...entry, metadata: { ...entry.metadata } });
  }

  async query(tenantId: string, filters: ActivityLogQuery): Promise<ActivityLogEntry[]> {
    const limit = normalizeLimit(filters.limit);
    return this.entries
      .filter((entry) => {
        if (entry.tenantId !== tenantId) return false;
        if (filters.service && entry.service !== filters.service) return false;
        if (filters.entityType && entry.entityType !== filters.entityType) return false;
        if (filters.entityId && entry.entityId !== filters.entityId) return false;
        if (filters.action && entry.action !== filters.action) return false;
        if (filters.actorId && entry.actorId !== filters.actorId) return false;
        return true;
      })
      .slice(-limit)
      .reverse()
      .map((entry) => ({ ...entry, metadata: { ...entry.metadata } }));
  }
}

function normalizeLimit(limit?: number) {
  if (!Number.isFinite(limit) || !limit || limit <= 0) {
    return 100;
  }
  return Math.min(limit, 500);
}
