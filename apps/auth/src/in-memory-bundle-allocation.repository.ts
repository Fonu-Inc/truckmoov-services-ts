import { Injectable } from '@nestjs/common';
import {
  EXPIRING_WITHIN_DAYS,
  effectiveAllocationStatus,
  type BundleAllocationFilters,
  type BundleAllocationRepository,
  type StoredBundleAllocation,
} from './bundle-allocation.repository';

@Injectable()
export class InMemoryBundleAllocationRepository implements BundleAllocationRepository {
  private readonly store = new Map<string, StoredBundleAllocation>();

  async findAll(filters?: BundleAllocationFilters): Promise<{ items: StoredBundleAllocation[]; total: number }> {
    let results = [...this.store.values()];
    if (filters?.tenantId !== undefined) results = results.filter((a) => a.tenantId === filters.tenantId);
    if (filters?.status !== 'cancelled') results = results.filter((a) => a.status !== 'cancelled');
    if (filters?.status === 'expiring') {
      const expiring = new Set((await this.findExpiringWithin(filters.tenantId ?? '', EXPIRING_WITHIN_DAYS)).map((a) => a.id));
      results = results.filter((a) => expiring.has(a.id));
    } else if (filters?.status) {
      results = results.filter((a) => effectiveAllocationStatus(a) === filters.status);
    }
    // shortcut: search and billingCycles do not look into the catalog here (the Mikro repository does); fine for in-memory runs.
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      results = results.filter((a) => a.mobileNumber.toLowerCase().includes(q));
    }
    results = results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const total = results.length;
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? total;
    const start = (page - 1) * limit;
    return { items: results.slice(start, start + limit), total };
  }

  async findById(id: string): Promise<StoredBundleAllocation | null> {
    return this.store.get(id) ?? null;
  }

  async findByPaymentReference(tenantId: string, paymentReference: string): Promise<StoredBundleAllocation[]> {
    return [...this.store.values()].filter((a) => a.tenantId === tenantId && a.paymentReference === paymentReference);
  }

  async save(allocation: StoredBundleAllocation): Promise<void> {
    this.store.set(allocation.id, allocation);
  }

  async countByStatus(tenantId: string): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const a of this.store.values()) {
      if (a.tenantId !== tenantId) continue;
      const status = effectiveAllocationStatus(a);
      counts[status] = (counts[status] ?? 0) + 1;
    }
    return counts;
  }

  async findExpiringWithin(tenantId: string, days: number): Promise<StoredBundleAllocation[]> {
    const now = new Date();
    const cutoff = new Date(now.getTime() + days * 86400_000);
    return [...this.store.values()].filter(
      (a) =>
        a.tenantId === tenantId &&
        a.status === 'active' &&
        a.expiresAt !== null &&
        a.expiresAt >= now &&
        a.expiresAt <= cutoff,
    );
  }

  async sumDataUsedByBundle(
    tenantId: string,
    window?: { start: Date; end: Date },
  ): Promise<Array<{ bundleId: string; usedMb: number; totalMb: number }>> {
    const map = new Map<string, { usedMb: number; totalMb: number }>();
    for (const a of this.store.values()) {
      if (a.tenantId !== tenantId || a.status === 'cancelled') continue;
      if (window && !liveIn(a, window)) continue;
      const existing = map.get(a.bundleId) ?? { usedMb: 0, totalMb: 0 };
      map.set(a.bundleId, {
        usedMb: existing.usedMb + a.dataUsedMb,
        totalMb: existing.totalMb + a.dataTotalMb,
      });
    }
    return [...map.entries()].map(([bundleId, data]) => ({ bundleId, ...data }));
  }

  async expireDue(now: Date): Promise<number> {
    let moved = 0;
    for (const a of this.store.values()) {
      if (a.status !== 'active' || !a.expiresAt || a.expiresAt >= now) continue;
      this.store.set(a.id, { ...a, status: 'expired', updatedAt: now });
      moved++;
    }
    return moved;
  }
}

function liveIn(a: { activatedAt: Date | null; expiresAt: Date | null }, window: { start: Date; end: Date }): boolean {
  return (!a.activatedAt || a.activatedAt <= window.end) && (!a.expiresAt || a.expiresAt >= window.start);
}
