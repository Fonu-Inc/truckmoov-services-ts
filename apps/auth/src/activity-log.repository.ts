import type { ChainBreak } from "@shared/audit";
import type { ActivityLogEntry, ActivityLogQuery } from "./activity-log.types";

export type ChainVerification = {
  tenantId: string;
  entriesChecked: number;
  intact: boolean;
  firstBreak: ChainBreak | null;
};

export interface ActivityLogRepository {
  save(entry: ActivityLogEntry): Promise<void>;
  query(tenantId: string, filters: ActivityLogQuery): Promise<ActivityLogEntry[]>;
  verifyChain(tenantId: string): Promise<ChainVerification>;
}

export const ACTIVITY_LOG_REPOSITORY = Symbol("ACTIVITY_LOG_REPOSITORY");

/**
 * The fields the hash covers, shared by both repositories. If they built this
 * shape differently, the same entry would hash two ways and a chain written by
 * one backend would not verify under the other.
 */
export function toHashableActivityEntry(entry: ActivityLogEntry) {
  return {
    id: entry.id,
    tenantId: entry.tenantId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    actorId: entry.actorId ?? null,
    actorRole: entry.actorRole ?? null,
    summary: entry.summary,
    metadata: entry.metadata,
    occurredAt: entry.occurredAt,
  };
}
