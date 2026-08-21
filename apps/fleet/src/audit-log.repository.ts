import type { AuditEntityType, AuditEntry } from "./audit-log.service";

export type AuditLogFilters = {
  entityType?: AuditEntityType;
  entityId?: string;
  action?: string;
  limit?: number;
};

export interface AuditLogRepository {
  /** Append-only: an audit entry is never updated or removed once written. */
  append(entry: AuditEntry): Promise<void>;
  query(tenantId: string, filters: AuditLogFilters): Promise<AuditEntry[]>;
}

export const AUDIT_LOG_REPOSITORY = Symbol("AUDIT_LOG_REPOSITORY");
