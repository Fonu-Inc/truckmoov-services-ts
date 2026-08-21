import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import {
  DocumentAccessLogRecord,
  getFleetOrm,
} from "../../shared/infrastructure/persistence/fleet-orm";
import type {
  AccessLogAction,
  AccessLogEntry,
  AccessLogRepository,
} from "../domain/access-log.repository";

function toEntry(record: DocumentAccessLogRecord): AccessLogEntry {
  return {
    id: record.id,
    docId: record.docId,
    tenantId: record.tenantId,
    action: record.action as AccessLogAction,
    userId: record.userId,
    ip: record.ip,
    at: record.at,
  };
}

@Injectable()
export class MikroAccessLogRepository implements AccessLogRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async append(entry: AccessLogEntry): Promise<void> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    em.persist(em.create(DocumentAccessLogRecord, entry as DocumentAccessLogRecord));
    await em.flush();
  }

  async findByDocId(docId: string, tenantId: string): Promise<AccessLogEntry[]> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const records = await em.find(
      DocumentAccessLogRecord,
      { docId, tenantId },
      { orderBy: { at: "desc" } },
    );
    return records.map(toEntry);
  }
}
