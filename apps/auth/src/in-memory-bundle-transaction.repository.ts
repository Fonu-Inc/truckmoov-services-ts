import { Injectable } from '@nestjs/common';
import type {
  BundleTransactionFilters,
  BundleTransactionRepository,
  StoredBundleTransaction,
} from './bundle-transaction.repository';

@Injectable()
export class InMemoryBundleTransactionRepository implements BundleTransactionRepository {
  private readonly store = new Map<string, StoredBundleTransaction>();

  async findAll(filters?: BundleTransactionFilters): Promise<{ items: StoredBundleTransaction[]; total: number }> {
    let results = [...this.store.values()];
    if (filters?.tenantId !== undefined) results = results.filter((t) => t.tenantId === filters.tenantId);
    if (filters?.status) results = results.filter((t) => t.status === filters.status);
    if (filters?.bundleIds) results = results.filter((t) => filters.bundleIds!.includes(t.bundleId));
    if (filters?.startDate) results = results.filter((t) => t.createdAt >= filters.startDate!);
    if (filters?.endDate) results = results.filter((t) => t.createdAt <= filters.endDate!);
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      results = results.filter(
        (t) =>
          t.mobileNumber.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q) ||
          (t.paymentReference ?? '').toLowerCase().includes(q),
      );
    }
    results = results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const total = results.length;
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? total;
    const start = (page - 1) * limit;
    return { items: results.slice(start, start + limit), total };
  }

  async save(transaction: StoredBundleTransaction): Promise<void> {
    this.store.set(transaction.id, transaction);
  }

  async failByPaymentReference(tenantId: string, paymentReference: string, reason: string): Promise<void> {
    for (const t of this.store.values()) {
      if (t.tenantId === tenantId && t.paymentReference === paymentReference && t.status === 'success') {
        this.store.set(t.id, { ...t, status: 'failed', failureReason: reason });
      }
    }
  }

  async sumByDate(tenantId: string, startDate: Date, endDate: Date): Promise<Array<{ date: string; amountKobo: number }>> {
    const map = new Map<string, number>();
    for (const t of this.store.values()) {
      if (t.tenantId !== tenantId || t.status !== 'success' || t.createdAt < startDate || t.createdAt > endDate) continue;
      const date = t.createdAt.toISOString().slice(0, 10);
      map.set(date, (map.get(date) ?? 0) + t.amountKobo);
    }
    return [...map.entries()].map(([date, amountKobo]) => ({ date, amountKobo }));
  }

  async sumByBundle(tenantId: string, startDate: Date, endDate: Date): Promise<Array<{ bundleId: string; amountKobo: number }>> {
    const map = new Map<string, number>();
    for (const t of this.store.values()) {
      if (t.tenantId !== tenantId || t.status !== 'success' || t.createdAt < startDate || t.createdAt > endDate) continue;
      map.set(t.bundleId, (map.get(t.bundleId) ?? 0) + t.amountKobo);
    }
    return [...map.entries()].map(([bundleId, amountKobo]) => ({ bundleId, amountKobo }));
  }

  async sumByCarrier(
    tenantId: string,
    startDate: Date,
    endDate: Date,
    bundles: Array<{ id: string; carrierId: string }>,
  ): Promise<Array<{ carrierId: string; amountKobo: number }>> {
    const bundleToCarrier = new Map(bundles.map((b) => [b.id, b.carrierId]));
    const byBundle = await this.sumByBundle(tenantId, startDate, endDate);
    const map = new Map<string, number>();
    for (const { bundleId, amountKobo } of byBundle) {
      const carrierId = bundleToCarrier.get(bundleId);
      if (!carrierId) continue;
      map.set(carrierId, (map.get(carrierId) ?? 0) + amountKobo);
    }
    return [...map.entries()].map(([carrierId, amountKobo]) => ({ carrierId, amountKobo }));
  }

  async sumTotalByTenantAndMonth(tenantId: string, year: number, month: number): Promise<number> {
    return [...this.store.values()]
      .filter((t) => {
        if (t.tenantId !== tenantId || t.status !== 'success') return false;
        const d = t.createdAt;
        return d.getFullYear() === year && d.getMonth() + 1 === month;
      })
      .reduce((sum, t) => sum + t.amountKobo, 0);
  }

  async countByTenantAndMonth(tenantId: string, year: number, month: number): Promise<number> {
    return [...this.store.values()].filter((t) => {
      if (t.tenantId !== tenantId || t.status !== 'success') return false;
      const d = t.createdAt;
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    }).length;
  }
}
