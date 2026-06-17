import { Injectable } from '@nestjs/common';
import type {
  KycDocumentRepository,
  StoredKycDocument,
} from './tenant-kyc-document.repository';

@Injectable()
export class InMemoryKycDocumentRepository implements KycDocumentRepository {
  private readonly store = new Map<string, StoredKycDocument>();

  async findAllByTenantId(tenantId: string): Promise<StoredKycDocument[]> {
    return [...this.store.values()]
      .filter((d) => d.tenantId === tenantId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findById(id: string): Promise<StoredKycDocument | null> {
    return this.store.get(id) ?? null;
  }

  async save(doc: StoredKycDocument): Promise<void> {
    this.store.set(doc.id, doc);
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}
