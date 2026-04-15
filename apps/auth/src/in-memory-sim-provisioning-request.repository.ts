import { Injectable } from '@nestjs/common';
import type {
  SimProvisioningRequestRepository,
  StoredSimProvisioningRequest,
} from './sim-provisioning-request.repository';

@Injectable()
export class InMemorySimProvisioningRequestRepository
  implements SimProvisioningRequestRepository
{
  private readonly store = new Map<string, StoredSimProvisioningRequest>();

  async findAll(filters?: {
    status?: string;
  }): Promise<StoredSimProvisioningRequest[]> {
    let requests = [...this.store.values()];
    if (filters?.status)
      requests = requests.filter((r) => r.status === filters.status);
    return requests.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  async findById(id: string): Promise<StoredSimProvisioningRequest | null> {
    return this.store.get(id) ?? null;
  }

  async save(request: StoredSimProvisioningRequest): Promise<void> {
    this.store.set(request.id, request);
  }
}
