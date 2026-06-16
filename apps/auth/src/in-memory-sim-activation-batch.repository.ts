import { Injectable } from '@nestjs/common';
import type {
  SimActivationBatchFilters,
  SimActivationBatchRepository,
  StoredSimActivationBatch,
} from './sim-activation-batch.repository';

@Injectable()
export class InMemorySimActivationBatchRepository
  implements SimActivationBatchRepository
{
  private readonly store = new Map<string, StoredSimActivationBatch>();

  async findAll(
    filters?: SimActivationBatchFilters,
  ): Promise<StoredSimActivationBatch[]> {
    let batches = [...this.store.values()];
    if (filters?.status)
      batches = batches.filter((b) => b.status === filters.status);
    if (filters?.operator) {
      const q = filters.operator.toLowerCase();
      batches = batches.filter((b) => b.operator.toLowerCase() === q);
    }
    if (filters?.mode)
      batches = batches.filter((b) => b.activationMode === filters.mode);
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      batches = batches.filter(
        (b) =>
          b.tenantName.toLowerCase().includes(q) ||
          b.operator.toLowerCase().includes(q) ||
          b.id.toLowerCase().includes(q),
      );
    }
    return batches.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  async findById(id: string): Promise<StoredSimActivationBatch | null> {
    return this.store.get(id) ?? null;
  }

  async save(batch: StoredSimActivationBatch): Promise<void> {
    this.store.set(batch.id, batch);
  }
}
