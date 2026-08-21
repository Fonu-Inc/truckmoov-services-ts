import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import {
  DocumentRecord,
  getFleetOrm,
} from "../../shared/infrastructure/persistence/fleet-orm";
import { Document, type DocumentProps, type EntityType } from "../domain/document.entity";
import type { DocumentRepository } from "../domain/document.repository";

function toDomain(record: DocumentRecord): Document {
  return Document.create({
    id: record.id,
    tenantId: record.tenantId,
    entityType: record.entityType as DocumentProps["entityType"],
    entityId: record.entityId,
    docType: record.docType as DocumentProps["docType"],
    key: record.key,
    filename: record.filename,
    contentType: record.contentType,
    sizeBytes: record.sizeBytes,
    uploadedBy: record.uploadedBy,
    uploadedAt: record.uploadedAt,
    expiresAt: record.expiresAt ?? null,
  });
}

@Injectable()
export class MikroDocumentRepository implements DocumentRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async save(doc: Document): Promise<void> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(DocumentRecord, doc.toPrimitives() as unknown as DocumentRecord);
  }

  async findById(id: string, tenantId: string): Promise<Document | null> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(DocumentRecord, { id, tenantId });
    return record ? toDomain(record) : null;
  }

  async findByEntity(
    tenantId: string,
    entityType: EntityType,
    entityId: string,
  ): Promise<Document[]> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const records = await em.find(
      DocumentRecord,
      { tenantId, entityType, entityId },
      { orderBy: { uploadedAt: "desc" } },
    );
    return records.map(toDomain);
  }
}
