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
