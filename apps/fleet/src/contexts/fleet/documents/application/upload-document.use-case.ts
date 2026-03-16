import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { ObjectStorageService } from "@shared/object-storage";
import { Document, type DocumentType, type EntityType } from "../domain/document.entity";
import { DOCUMENT_REPOSITORY, type DocumentRepository } from "../domain/document.repository";
import { ACCESS_LOG_REPOSITORY, type AccessLogRepository } from "../domain/access-log.repository";

export type UploadDocumentCommand = {
  tenantId: string;
  entityType: EntityType;
  entityId: string;
  docType: DocumentType;
  filename: string;
  contentType: string;
  buffer: Buffer;
  uploadedBy: string;
};

@Injectable()
export class UploadDocumentUseCase {
  private readonly retentionDays: number;

  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly docRepo: DocumentRepository,
    @Inject(ACCESS_LOG_REPOSITORY) private readonly logRepo: AccessLogRepository,
    private readonly storage: ObjectStorageService,
    @Inject(AppConfigService) config: AppConfigService,
  ) {
    this.retentionDays = config.fleet.documentRetentionDays;
  }

  async execute(cmd: UploadDocumentCommand): Promise<Document> {
    const id = crypto.randomUUID();
    const key = `${cmd.tenantId}/${cmd.entityType}/${cmd.entityId}/${cmd.docType}/${id}-${cmd.filename}`;

    await this.storage.putObject({ key, body: cmd.buffer, contentType: cmd.contentType });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.retentionDays);

    const doc = Document.create({
      id,
      tenantId: cmd.tenantId,
      entityType: cmd.entityType,
      entityId: cmd.entityId,
      docType: cmd.docType,
      key,
      filename: cmd.filename,
      contentType: cmd.contentType,
      sizeBytes: cmd.buffer.byteLength,
      uploadedBy: cmd.uploadedBy,
      uploadedAt: new Date(),
      expiresAt,
    });

    await this.docRepo.save(doc);
    await this.logRepo.append({
      id: crypto.randomUUID(),
      docId: id,
      tenantId: cmd.tenantId,
      action: "upload",
      userId: cmd.uploadedBy,
      ip: "server",
      at: new Date(),
    });

    return doc;
  }
}
