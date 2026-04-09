import type { ActivityLogEntry, ActivityLogQuery } from "./activity-log.types";

export interface ActivityLogRepository {
  save(entry: ActivityLogEntry): Promise<void>;
  query(tenantId: string, filters: ActivityLogQuery): Promise<ActivityLogEntry[]>;
}

export const ACTIVITY_LOG_REPOSITORY = Symbol("ACTIVITY_LOG_REPOSITORY");
