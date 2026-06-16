import { Injectable } from '@nestjs/common';
import type {
  SimProvisioningRequestFilters,
  SimProvisioningRequestRepository,
  StoredSimProvisioningRequest,
} from './sim-provisioning-request.repository';

@Injectable()
export class InMemorySimProvisioningRequestRepository
  implements SimProvisioningRequestRepository
{
  private readonly store = new Map<string, StoredSimProvisioningRequest>();

  async findAll(
    filters?: SimProvisioningRequestFilters,
  ): Promise<StoredSimProvisioningRequest[]> {
    let requests = [...this.store.values()];
    if (filters?.status)
      requests = requests.filter((r) => r.status === filters.status);
    if (filters?.organisation) {
      const q = filters.organisation.toLowerCase();
      requests = requests.filter(
        (r) =>
          r.tenantId.toLowerCase() === q ||
          r.tenantName.toLowerCase().includes(q),
      );
    }
    if (filters?.carrier) {
      const q = filters.carrier.toLowerCase();
      requests = requests.filter((r) => r.preferredOperator.toLowerCase() === q);
    }
    if (filters?.useCase) {
      const q = filters.useCase.toLowerCase();
      requests = requests.filter((r) => (r.useCase ?? '').toLowerCase().includes(q));
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      requests = requests.filter(
        (r) =>
          r.tenantName.toLowerCase().includes(q) ||
          r.preferredOperator.toLowerCase().includes(q) ||
          r.id.toLowerCase().includes(q),
      );
    }
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
