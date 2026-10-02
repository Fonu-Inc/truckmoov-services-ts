import { Injectable } from "@nestjs/common";
import { GENESIS_HASH, findChainBreak, hashAuditEntry, type ChainLink } from "@shared/audit";
import type {
  ActivityLogEntry,
  ActivityLogQuery,
  AuditFilterOptions,
  AuditLogQuery,
} from "./activity-log.types";
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

  /** The stored entries, without the chain columns the read model does not carry. */
  private all(): ActivityLogEntry[] {
    return this.entries.map(({ seq: _seq, prevHash: _prev, rowHash: _row, ...entry }) => entry);
  }

  async queryAcrossTenants(filters: AuditLogQuery): Promise<ActivityLogEntry[]> {
    return this.matchAcrossTenants(filters)
      .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
      .slice(0, filters.limit ?? 100);
  }

  async countAcrossTenants(filters: AuditLogQuery): Promise<number> {
    return this.matchAcrossTenants(filters).length;
  }

  private matchAcrossTenants(filters: AuditLogQuery): ActivityLogEntry[] {
    let results = this.all();

    if (filters.tenantId !== undefined) results = results.filter((e) => e.tenantId === filters.tenantId);
    if (filters.action) results = results.filter((e) => e.action === filters.action);
    if (filters.entityType) results = results.filter((e) => e.entityType === filters.entityType);
    if (filters.entityId) results = results.filter((e) => e.entityId === filters.entityId);
    if (filters.service) results = results.filter((e) => e.service === filters.service);
    if (filters.from) results = results.filter((e) => new Date(e.occurredAt) >= filters.from!);
    if (filters.to) results = results.filter((e) => new Date(e.occurredAt) <= filters.to!);

    if (filters.actor?.trim()) {
      const term = filters.actor.trim().toLowerCase();
      results = results.filter((entry) =>
        [entry.actorId, entry.actorName, entry.actorEmail].some((value) =>
          (value ?? "").toLowerCase().includes(term),
        ),
      );
    }

    if (filters.search?.trim()) {
      const term = filters.search.trim().toLowerCase();
      results = results.filter((entry) =>
        [
          entry.action,
          entry.entityType,
          entry.entityId,
          entry.summary,
          entry.actorName,
          entry.actorEmail,
          entry.tenantName,
          entry.tenantId,
          entry.service,
        ].some((value) => (value ?? "").toLowerCase().includes(term)),
      );
    }

    return results;
  }

  async filterOptions(): Promise<AuditFilterOptions> {
    const entries = this.all();
    const tenants = new Map<string, string | null>();
    for (const entry of entries) {
      tenants.set(entry.tenantId, entry.tenantName ?? tenants.get(entry.tenantId) ?? null);
    }

    return {
      tenants: [...tenants.entries()]
        .map(([tenantId, tenantName]) => ({ tenantId, tenantName }))
        .sort((a, b) => a.tenantId.localeCompare(b.tenantId)),
      actions: distinct(entries.map((entry) => entry.action)),
      resourceTypes: distinct(entries.map((entry) => entry.entityType)),
      services: distinct(entries.map((entry) => entry.service)),
    };
  }

  async listChainTenantIds(): Promise<string[]> {
    return distinct(this.all().map((entry) => entry.tenantId));
  }

}

function normalizeLimit(limit?: number) {
  if (!Number.isFinite(limit) || !limit || limit <= 0) {
    return 100;
  }
  return Math.min(limit, 500);
}

function distinct(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}
