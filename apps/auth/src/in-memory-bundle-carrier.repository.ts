import { Injectable } from '@nestjs/common';
import type { BundleCarrierRepository, StoredBundleCarrier } from './bundle-carrier.repository';

@Injectable()
export class InMemoryBundleCarrierRepository implements BundleCarrierRepository {
  private readonly store = new Map<string, StoredBundleCarrier>();

  async findAll(activeOnly?: boolean): Promise<StoredBundleCarrier[]> {
    let results = [...this.store.values()];
    if (activeOnly) results = results.filter((c) => c.active);
    return results.sort((a, b) => a.name.localeCompare(b.name));
  }

  async findById(id: string): Promise<StoredBundleCarrier | null> {
    return this.store.get(id) ?? null;
  }

  async save(carrier: StoredBundleCarrier): Promise<void> {
    this.store.set(carrier.id, carrier);
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}
