import { Injectable } from "@nestjs/common";

export type AuditEntityType =
  | "job"
  | "vehicle"
  | "driver"
  | "device"
  | "fuel"
  | "alert"
  | "document"
  | "geofence";

export type AuditEntry = {
  id: string;
  tenantId: string;
  entityType: AuditEntityType;
  entityId: string;
  action: string;
  actorId: string;
  metadata: Record<string, unknown>;
  occurredAt: string;
};

@Injectable()
export class AuditLogService {
  private readonly entries: AuditEntry[] = [];

  record(entry: Omit<AuditEntry, "id">): void {
    this.entries.push({ id: crypto.randomUUID(), ...entry });
  }

  query(tenantId: string, filters: {
    entityType?: AuditEntityType;
    entityId?: string;
    action?: string;
    limit?: number;
  }): AuditEntry[] {
    const limit = filters.limit ?? 100;
    return this.entries
      .filter((e) => {
        if (e.tenantId !== tenantId) return false;
        if (filters.entityType && e.entityType !== filters.entityType) return false;
        if (filters.entityId && e.entityId !== filters.entityId) return false;
        if (filters.action && e.action !== filters.action) return false;
        return true;
      })
      .slice(-limit)
      .reverse();
  }
}
