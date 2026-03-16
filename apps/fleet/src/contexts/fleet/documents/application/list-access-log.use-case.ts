import { Inject, Injectable } from "@nestjs/common";
import type { AccessLogEntry } from "../domain/access-log.repository";
import { ACCESS_LOG_REPOSITORY, type AccessLogRepository } from "../domain/access-log.repository";

@Injectable()
export class ListAccessLogUseCase {
  constructor(@Inject(ACCESS_LOG_REPOSITORY) private readonly logRepo: AccessLogRepository) {}

  execute(tenantId: string, docId: string): Promise<AccessLogEntry[]> {
    return this.logRepo.findByDocId(docId, tenantId);
  }
}
