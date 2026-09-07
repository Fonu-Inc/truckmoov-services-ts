export type ActivityLogMetadata = Record<string, unknown>;

export type ActivityLogEntry = {
  id: string;
  tenantId: string;
  service: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  actorId: string | null;
  actorRole: string | null;
  /** As they were when the action happened, not as they are now. */
  actorName: string | null;
  actorEmail: string | null;
  tenantName: string | null;
  metadata: ActivityLogMetadata;
  occurredAt: string;
  recordedAt: string;
};

export type ActivityLogQuery = {
  service?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  actorId?: string;
  limit?: number;
};

/**
 * The cross-tenant audit screen. Separate from ActivityLogQuery because that
 * one is always scoped to a single tenant and this one deliberately is not.
 */
export type AuditLogQuery = {
  tenantId?: string;
  /** Matches an actor id, name or email — the screen offers one box for all three. */
  actor?: string;
  action?: string;
  entityType?: string;
  service?: string;
  from?: Date;
  to?: Date;
  /** Free text across every displayed field. */
  search?: string;
  limit?: number;
};

/** The distinct values behind the filter panel's dropdowns. */
export type AuditFilterOptions = {
  tenants: Array<{ tenantId: string; tenantName: string | null }>;
  actions: string[];
  resourceTypes: string[];
  services: string[];
};
