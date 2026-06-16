import { Injectable } from '@nestjs/common';
import type { SimRepository, StoredSim } from './sim.repository';

@Injectable()
export class InMemorySimRepository implements SimRepository {
  private readonly store = new Map<string, StoredSim>();

  async findAll(filters?: {
    status?: string;
    carrier?: string;
    tenantId?: string;
    search?: string;
  }): Promise<StoredSim[]> {
    let sims = [...this.store.values()];
    if (filters?.status) sims = sims.filter((s) => s.status === filters.status);
    if (filters?.carrier) sims = sims.filter((s) => s.carrier === filters.carrier);
    if (filters?.tenantId) sims = sims.filter((s) => s.tenantId === filters.tenantId);
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      sims = sims.filter(
        (s) =>
          s.iccid.toLowerCase().includes(q) ||
          (s.msisdn && s.msisdn.toLowerCase().includes(q)),
      );
    }
    return sims.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findById(id: string): Promise<StoredSim | null> {
    return this.store.get(id) ?? null;
  }

  async save(sim: StoredSim): Promise<void> {
    this.store.set(sim.id, sim);
  }

  async countByStatus(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const sim of this.store.values()) {
      counts[sim.status] = (counts[sim.status] || 0) + 1;
    }
    return counts;
  }

  async countByCarrier(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const sim of this.store.values()) {
      counts[sim.carrier] = (counts[sim.carrier] || 0) + 1;
    }
    return counts;
  }

  async countUnassigned(): Promise<number> {
    return [...this.store.values()].filter((s) => s.tenantId === null).length;
  }
}
