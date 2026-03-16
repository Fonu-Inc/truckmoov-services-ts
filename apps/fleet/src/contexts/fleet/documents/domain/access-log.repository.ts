export type AccessLogAction = "upload" | "download";

export type AccessLogEntry = {
  id: string;
  docId: string;
  tenantId: string;
  action: AccessLogAction;
  userId: string;
  ip: string;
  at: Date;
};

export interface AccessLogRepository {
  append(entry: AccessLogEntry): Promise<void>;
  findByDocId(docId: string, tenantId: string): Promise<AccessLogEntry[]>;
}

export const ACCESS_LOG_REPOSITORY = Symbol("ACCESS_LOG_REPOSITORY");
