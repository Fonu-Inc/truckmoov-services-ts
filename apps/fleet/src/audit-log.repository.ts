import type { ChainBreak } from "@shared/audit";
import type { AuditEntityType, AuditEntry } from "./audit-log.service";

export type AuditLogFilters = {
  entityType?: AuditEntityType;
  entityId?: string;
  action?: string;
  limit?: number;
};

export type ChainVerification = {
  tenantId: string;
  entriesChecked: number;
  intact: boolean;
  firstBreak: ChainBreak | null;
};

export interface AuditLogRepository {
  /** Append-only: an audit entry is never updated or removed once written. */
  append(entry: AuditEntry): Promise<void>;
  query(tenantId: string, filters: AuditLogFilters): Promise<AuditEntry[]>;
  verifyChain(tenantId: string): Promise<ChainVerification>;
}

export const AUDIT_LOG_REPOSITORY = Symbol("AUDIT_LOG_REPOSITORY");

/**
 * The fields the hash covers, shared by both repositories. If they built this
 * shape differently, the same entry would hash two ways and a chain written by
 * one backend would not verify under the other.
 */
export function toHashableAuditEntry(entry: AuditEntry) {
  return {
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
  };
}
