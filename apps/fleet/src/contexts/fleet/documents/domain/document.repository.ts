import type { Document } from "./document.entity";
import type { EntityType } from "./document.entity";

export interface DocumentRepository {
  save(doc: Document): Promise<void>;
  findById(id: string, tenantId: string): Promise<Document | null>;
  findByEntity(tenantId: string, entityType: EntityType, entityId: string): Promise<Document[]>;
  countUploadedBetween(tenantId: string, from: Date, to: Date): Promise<number>;
}

export const DOCUMENT_REPOSITORY = Symbol("DOCUMENT_REPOSITORY");
