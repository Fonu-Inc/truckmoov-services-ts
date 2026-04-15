import { Injectable } from '@nestjs/common';
import type {
  SimActivationBatchRepository,
  StoredSimActivationBatch,
} from './sim-activation-batch.repository';

@Injectable()
export class InMemorySimActivationBatchRepository
  implements SimActivationBatchRepository
{
  private readonly store = new Map<string, StoredSimActivationBatch>();

  async findAll(filters?: {
    status?: string;
  }): Promise<StoredSimActivationBatch[]> {
    let batches = [...this.store.values()];
    if (filters?.status)
      batches = batches.filter((b) => b.status === filters.status);
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
