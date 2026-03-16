import { Inject, Injectable } from "@nestjs/common";
import type { Document, EntityType } from "../domain/document.entity";
import { DOCUMENT_REPOSITORY, type DocumentRepository } from "../domain/document.repository";

@Injectable()
export class ListDocumentsUseCase {
  constructor(@Inject(DOCUMENT_REPOSITORY) private readonly docRepo: DocumentRepository) {}

  execute(tenantId: string, entityType: EntityType, entityId: string): Promise<Document[]> {
    return this.docRepo.findByEntity(tenantId, entityType, entityId);
  }
}
