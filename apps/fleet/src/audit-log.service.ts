import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  AUDIT_LOG_REPOSITORY,
  type AuditLogFilters,
  type AuditLogRepository,
  type ChainVerification,
} from "./audit-log.repository";

export type AuditEntityType =
  | "job"
  | "vehicle"
  | "driver"
  | "device"
  | "device_setup_request"
  | "fuel"
  | "alert"
  | "document"
  | "waybill"
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
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    @Inject(AUDIT_LOG_REPOSITORY) private readonly repository: AuditLogRepository,
  ) {}

  /**
   * Writes one audit entry. A failure is logged rather than thrown: losing the
   * record of an action is bad, but failing the action the caller already
   * completed is worse, and the caller has no way to undo it here.
   */
  async record(entry: Omit<AuditEntry, "id">): Promise<void> {
    try {
      await this.repository.append({ id: randomUUID(), ...entry });
    } catch (error) {
      this.logger.error(
        `audit_log_append_failed:${entry.entityType}:${entry.action}:${(error as Error).message}`,
      );
    }
  }

  async query(tenantId: string, filters: AuditLogFilters): Promise<AuditEntry[]> {
    return this.repository.query(tenantId, filters);
  }

  /** Recomputes the tenant's hash chain and reports the first entry that fails. */
  async verifyChain(tenantId: string): Promise<ChainVerification> {
    return this.repository.verifyChain(tenantId);
  }
}
