import { Injectable } from "@nestjs/common";
import type { AccessLogEntry, AccessLogRepository } from "../domain/access-log.repository";

@Injectable()
export class InMemoryAccessLogRepository implements AccessLogRepository {
  private readonly entries: AccessLogEntry[] = [];

  async append(entry: AccessLogEntry): Promise<void> {
    this.entries.push(entry);
  }

  async findByDocId(docId: string, tenantId: string): Promise<AccessLogEntry[]> {
    return this.entries.filter((e) => e.docId === docId && e.tenantId === tenantId);
  }
}
