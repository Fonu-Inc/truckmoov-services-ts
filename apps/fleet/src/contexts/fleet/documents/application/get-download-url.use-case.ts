import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ObjectStorageService } from "@shared/object-storage";
import { DOCUMENT_REPOSITORY, type DocumentRepository } from "../domain/document.repository";
import { ACCESS_LOG_REPOSITORY, type AccessLogRepository } from "../domain/access-log.repository";

@Injectable()
export class GetDownloadUrlUseCase {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly docRepo: DocumentRepository,
    @Inject(ACCESS_LOG_REPOSITORY) private readonly logRepo: AccessLogRepository,
    private readonly storage: ObjectStorageService,
  ) {}

  async execute(tenantId: string, docId: string, userId: string, ip: string): Promise<{ url: string; expiresIn: number }> {
    const doc = await this.docRepo.findById(docId, tenantId);
    if (!doc) throw new NotFoundException(`Document ${docId} not found`);

    const expiresIn = 900;
    const url = await this.storage.createPresignedDownloadUrl({ key: doc.key, expiresIn });

    await this.logRepo.append({
      id: crypto.randomUUID(),
      docId,
      tenantId,
      action: "download",
      userId,
      ip,
      at: new Date(),
    });

    return { url, expiresIn };
  }
}
