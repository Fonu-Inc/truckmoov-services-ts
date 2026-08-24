import { Injectable } from "@nestjs/common";
import { GENESIS_HASH, findChainBreak, hashAuditEntry, type ChainLink } from "@shared/audit";
import type { ActivityLogEntry, ActivityLogQuery } from "./activity-log.types";
import { toHashableActivityEntry } from "./activity-log.repository";
import type { ActivityLogRepository, ChainVerification } from "./activity-log.repository";

type StoredEntry = ActivityLogEntry & { seq: number; prevHash: string; rowHash: string };

@Injectable()
export class InMemoryActivityLogRepository implements ActivityLogRepository {
  private readonly entries: StoredEntry[] = [];
  private readonly headByTenant = new Map<string, string>();
  private nextSeq = 1;

  // Chains entries exactly as the Postgres repository does, so a test can hold
  // the whole guarantee without a database and the two backends cannot drift.
  async save(entry: ActivityLogEntry): Promise<void> {
    const stored: ActivityLogEntry = { ...entry, metadata: { ...entry.metadata } };
    const prevHash = this.headByTenant.get(entry.tenantId) ?? GENESIS_HASH;
    const rowHash = hashAuditEntry(toHashableActivityEntry(stored), prevHash);

    this.entries.push({ ...stored, seq: this.nextSeq++, prevHash, rowHash });
    this.headByTenant.set(entry.tenantId, rowHash);
  }

  async verifyChain(tenantId: string): Promise<ChainVerification> {
    const links: ChainLink[] = this.entries
      .filter((entry) => entry.tenantId === tenantId)
      .sort((left, right) => left.seq - right.seq)
      .map((entry) => ({
        ...toHashableActivityEntry(entry),
        seq: entry.seq,
        prevHash: entry.prevHash,
        rowHash: entry.rowHash,
      }));

    const firstBreak = findChainBreak(links);
    return { tenantId, entriesChecked: links.length, intact: firstBreak === null, firstBreak };
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
