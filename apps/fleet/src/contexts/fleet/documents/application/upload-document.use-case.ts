import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { ObjectStorageService } from "@shared/object-storage";
import { Document, type DocumentType, type EntityType } from "../domain/document.entity";
import { DOCUMENT_REPOSITORY, type DocumentRepository } from "../domain/document.repository";
import { ACCESS_LOG_REPOSITORY, type AccessLogRepository } from "../domain/access-log.repository";
import { FILE_SCANNER, type FileScanner } from "../domain/file-scanner.port";
import { StorageReporterService } from "../../../../storage-reporter.service";

/** Documents arrive from outside the platform, so the accepted types are listed rather than filtered. */
export const ALLOWED_DOCUMENT_CONTENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export class DocumentTooLargeError extends Error {
  constructor(sizeBytes: number, maxBytes: number) {
    super(`Document is ${sizeBytes} bytes and the limit is ${maxBytes} bytes`);
  }
}

export class DocumentTypeNotAllowedError extends Error {
  constructor(contentType: string) {
    super(`Document type ${contentType} is not accepted`);
  }
}

export class DocumentRejectedByScannerError extends Error {
  constructor(reason: string) {
    super(`Document was refused: ${reason}`);
  }
}

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
  private readonly maxBytes: number;
  private readonly scanRequired: boolean;

  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly docRepo: DocumentRepository,
    @Inject(ACCESS_LOG_REPOSITORY) private readonly logRepo: AccessLogRepository,
    private readonly storage: ObjectStorageService,
    @Inject(AppConfigService) config: AppConfigService,
    @Inject(FILE_SCANNER) private readonly scanner: FileScanner,
    @Inject(StorageReporterService) private readonly storageReporter: StorageReporterService,
  ) {
    this.retentionDays = config.fleet.documentRetentionDays;
    this.maxBytes = config.fleet.documentMaxBytes;
    this.scanRequired = config.fleet.documentScanRequired;
  }

  async execute(cmd: UploadDocumentCommand): Promise<Document> {
    // Every check runs before the file reaches storage, so a refused upload
    // leaves nothing behind to clean up.
    await this.assertAcceptable(cmd);

    // Reserved with auth before the bytes are written, for the same reason as
    // the checks above: a refused upload must leave nothing behind.
    await this.storageReporter.recordUpload(cmd.tenantId, cmd.buffer.byteLength);

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

  private async assertAcceptable(cmd: UploadDocumentCommand): Promise<void> {
    const sizeBytes = cmd.buffer.byteLength;
    if (sizeBytes > this.maxBytes) {
      throw new DocumentTooLargeError(sizeBytes, this.maxBytes);
    }

    const contentType = cmd.contentType.split(";")[0].trim().toLowerCase();
    if (!ALLOWED_DOCUMENT_CONTENT_TYPES.includes(contentType as (typeof ALLOWED_DOCUMENT_CONTENT_TYPES)[number])) {
      throw new DocumentTypeNotAllowedError(cmd.contentType);
    }

    const verdict = await this.scanner.scan(cmd.filename, contentType, cmd.buffer);
    if (verdict.scanned && !verdict.clean) {
      throw new DocumentRejectedByScannerError(verdict.reason ?? "flagged by scanner");
    }
    if (!verdict.scanned && this.scanRequired) {
      throw new DocumentRejectedByScannerError(verdict.reason ?? "scanning is required but unavailable");
    }
  }
}
