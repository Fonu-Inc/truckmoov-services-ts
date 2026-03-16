import { Injectable } from "@nestjs/common";
import type { Document, EntityType } from "../domain/document.entity";
import type { DocumentRepository } from "../domain/document.repository";

@Injectable()
export class InMemoryDocumentRepository implements DocumentRepository {
  private readonly store = new Map<string, Document>();

  async save(doc: Document): Promise<void> {
    this.store.set(doc.id, doc);
  }

  async findById(id: string, tenantId: string): Promise<Document | null> {
    const doc = this.store.get(id);
    return doc && doc.tenantId === tenantId ? doc : null;
  }

  async findByEntity(tenantId: string, entityType: EntityType, entityId: string): Promise<Document[]> {
    return [...this.store.values()].filter(
      (d) => d.tenantId === tenantId && d.entityType === entityType && d.entityId === entityId,
    );
  }
}
