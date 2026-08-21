import { Injectable } from '@nestjs/common';
import type { BundleCatalogFilters, BundleCatalogRepository, StoredBundleCatalog } from './bundle-catalog.repository';

@Injectable()
export class InMemoryBundleCatalogRepository implements BundleCatalogRepository {
  private readonly store = new Map<string, StoredBundleCatalog>();

  async findAll(filters?: BundleCatalogFilters): Promise<{ items: StoredBundleCatalog[]; total: number }> {
    let results = [...this.store.values()];
    if (filters?.carrierId) results = results.filter((b) => b.carrierId === filters.carrierId);
    if (filters?.billingCycle) results = results.filter((b) => b.billingCycle === filters.billingCycle);
    if (filters?.activeOnly) results = results.filter((b) => b.active);
    if (filters?.active !== undefined) results = results.filter((b) => b.active === filters.active);
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      results = results.filter(
        (b) => b.name.toLowerCase().includes(q) || b.code.toLowerCase().includes(q),
      );
    }
    const total = results.length;
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? total;
    const start = (page - 1) * limit;
    return { items: results.slice(start, start + limit), total };
  }

  async findById(id: string): Promise<StoredBundleCatalog | null> {
    return this.store.get(id) ?? null;
  }

  async save(bundle: StoredBundleCatalog): Promise<void> {
    this.store.set(bundle.id, bundle);
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}
