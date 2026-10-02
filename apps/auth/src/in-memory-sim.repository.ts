import { Injectable } from '@nestjs/common';
import type { SimFilters, SimRepository, StoredSim, TenantSimCount } from './sim.repository';

@Injectable()
export class InMemorySimRepository implements SimRepository {
  private readonly store = new Map<string, StoredSim>();

  async findAll(filters?: SimFilters): Promise<{ items: StoredSim[]; total: number }> {
    let sims = [...this.store.values()];
    if (filters?.status === 'unassigned') sims = sims.filter((s) => s.tenantId === null);
    else if (filters?.status) sims = sims.filter((s) => s.status === filters.status);
    if (filters?.carrier) sims = sims.filter((s) => s.carrier.toLowerCase() === filters.carrier!.toLowerCase());
    if (filters?.tenantId !== undefined) sims = sims.filter((s) => s.tenantId === filters.tenantId);
    if (filters?.operators?.length) sims = sims.filter((s) => filters.operators!.includes(s.carrier));
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      sims = sims.filter(
        (s) =>
          s.iccid.toLowerCase().includes(q) ||
          (s.msisdn && s.msisdn.toLowerCase().includes(q)) ||
          s.carrier.toLowerCase().includes(q) ||
          (s.tenantId !== null && !!filters.tenantIds?.includes(s.tenantId)),
      );
    }
    sims = sims.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const total = sims.length;
    if (filters?.unpaged) return { items: sims, total };
    if (filters?.page !== undefined && filters?.limit !== undefined) {
      const offset = (filters.page - 1) * filters.limit;
      sims = sims.slice(offset, offset + filters.limit);
    } else if (filters?.limit !== undefined) {
      sims = sims.slice(0, filters.limit);
    }
    return { items: sims, total };
  }

  async findById(id: string): Promise<StoredSim | null> {
    return this.store.get(id) ?? null;
  }

  async findByIccid(iccid: string): Promise<StoredSim | null> {
    return [...this.store.values()].find((s) => s.iccid === iccid) ?? null;
  }

  async findByIccids(iccids: string[]): Promise<StoredSim[]> {
    return [...this.store.values()].filter((s) => iccids.includes(s.iccid));
  }

  async findByDeviceIds(deviceIds: string[]): Promise<StoredSim[]> {
    return [...this.store.values()].filter((s) => s.deviceId !== null && deviceIds.includes(s.deviceId));
  }

  async findByMsisdns(tenantId: string, msisdns: string[]): Promise<StoredSim[]> {
    return [...this.store.values()].filter((s) => s.tenantId === tenantId && s.msisdn !== null && msisdns.includes(s.msisdn));
  }

  async save(sim: StoredSim): Promise<void> {
    this.store.set(sim.id, sim);
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }

  async countByStatus(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const sim of this.store.values()) counts[sim.status] = (counts[sim.status] || 0) + 1;
    return counts;
  }

  async countByCarrier(addedWithinDays?: number | null): Promise<Record<string, number>> {
    const since = addedWithinDays ? Date.now() - addedWithinDays * 86_400_000 : null;
    const counts: Record<string, number> = {};
    for (const sim of this.store.values()) {
      if (since !== null && sim.createdAt.getTime() < since) continue;
      counts[sim.carrier] = (counts[sim.carrier] || 0) + 1;
    }
    return counts;
  }

  async countUnassigned(): Promise<number> {
    return [...this.store.values()].filter((s) => s.tenantId === null).length;
  }

  async countActiveByTenant(): Promise<TenantSimCount[]> {
    const counts = new Map<string, number>();
    for (const sim of this.store.values()) {
      if (sim.status !== 'active' || !sim.tenantId) continue;
      counts.set(sim.tenantId, (counts.get(sim.tenantId) ?? 0) + 1);
    }
    return [...counts].map(([tenantId, activeSims]) => ({ tenantId, activeSims }));
  }
}
