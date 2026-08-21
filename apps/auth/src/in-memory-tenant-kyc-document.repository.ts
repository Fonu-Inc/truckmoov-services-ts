import { Injectable } from '@nestjs/common';
import type {
  KycDocumentQueueFilters,
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

  async findForReview(
    filters?: KycDocumentQueueFilters,
  ): Promise<{ items: StoredKycDocument[]; total: number }> {
    let results = [...this.store.values()];
    if (filters?.status) results = results.filter((d) => d.status === filters.status);
    if (filters?.tenantId) results = results.filter((d) => d.tenantId === filters.tenantId);
    results.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    const total = results.length;
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? total;
    const start = (page - 1) * limit;
    return { items: results.slice(start, start + limit), total };
  }

  async save(doc: StoredKycDocument): Promise<void> {
    this.store.set(doc.id, doc);
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}
