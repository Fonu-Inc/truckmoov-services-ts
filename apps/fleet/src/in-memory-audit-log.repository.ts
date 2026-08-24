import { Injectable } from "@nestjs/common";
import { GENESIS_HASH, findChainBreak, hashAuditEntry, type ChainLink } from "@shared/audit";
import { toHashableAuditEntry } from "./audit-log.repository";
import type { AuditLogFilters, AuditLogRepository, ChainVerification } from "./audit-log.repository";
import type { AuditEntry } from "./audit-log.service";

type StoredEntry = AuditEntry & { seq: number; prevHash: string; rowHash: string };

@Injectable()
export class InMemoryAuditLogRepository implements AuditLogRepository {
  private readonly entries: StoredEntry[] = [];
  private readonly headByTenant = new Map<string, string>();
  private nextSeq = 1;

  // Chains entries exactly as the Postgres repository does, so a test can hold
  // the whole guarantee without a database and the two backends cannot drift.
  async append(entry: AuditEntry): Promise<void> {
    const prevHash = this.headByTenant.get(entry.tenantId) ?? GENESIS_HASH;
    const rowHash = hashAuditEntry(toHashableAuditEntry(entry), prevHash);

    this.entries.push({ ...entry, seq: this.nextSeq++, prevHash, rowHash });
    this.headByTenant.set(entry.tenantId, rowHash);
  }

  async verifyChain(tenantId: string): Promise<ChainVerification> {
    const links: ChainLink[] = this.entries
      .filter((entry) => entry.tenantId === tenantId)
      .sort((left, right) => left.seq - right.seq)
      .map((entry) => ({
        ...toHashableAuditEntry(entry),
        seq: entry.seq,
        prevHash: entry.prevHash,
        rowHash: entry.rowHash,
      }));

    const firstBreak = findChainBreak(links);
    return { tenantId, entriesChecked: links.length, intact: firstBreak === null, firstBreak };
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
