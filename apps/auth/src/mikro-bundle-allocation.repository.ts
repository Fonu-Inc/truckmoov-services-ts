import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  BundleAllocationRecord,
  getAuthOrm,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type {
  BundleAllocationFilters,
  BundleAllocationRepository,
  StoredBundleAllocation,
} from './bundle-allocation.repository';

function toStored(r: BundleAllocationRecord): StoredBundleAllocation {
  return {
    id: r.id,
    tenantId: r.tenantId,
    mobileNumber: r.mobileNumber,
    bundleId: r.bundleId,
    dataUsedMb: Number(r.dataUsedMb),
    dataTotalMb: Number(r.dataTotalMb),
    activatedAt: r.activatedAt,
    expiresAt: r.expiresAt,
    status: r.status,
    paymentReference: r.paymentReference,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

@Injectable()
export class MikroBundleAllocationRepository implements BundleAllocationRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async findAll(filters?: BundleAllocationFilters): Promise<{ items: StoredBundleAllocation[]; total: number }> {
    const orm = await getAuthOrm(this.config.db);
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.tenantId) { conditions.push('tenant_id = ?'); params.push(filters.tenantId); }
    if (filters?.status) { conditions.push('status = ?'); params.push(filters.status); }
    if (filters?.search) {
      conditions.push('mobile_number ilike ?');
      params.push(`%${filters.search}%`);
    }

    const where = conditions.length ? `where ${conditions.join(' and ')}` : '';
    const countRows = await orm.em.getConnection().execute<Array<{ count: string }>>(
      `select count(*)::int as count from bundle_allocations ${where}`,
      params,
    );
    const total = Number(countRows[0]?.count ?? 0);

    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 50;
    const offset = (page - 1) * limit;
    const rows = await orm.em.getConnection().execute<BundleAllocationRecord[]>(
      `select * from bundle_allocations ${where} order by created_at desc limit ? offset ?`,
      [...params, limit, offset],
    );
    const em = orm.em.fork();
    return { items: rows.map((r) => toStored(em.map(BundleAllocationRecord, r))), total };
  }

  async findById(id: string): Promise<StoredBundleAllocation | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(BundleAllocationRecord, { id });
    return record ? toStored(record) : null;
  }

  async findByPaymentReference(tenantId: string, paymentReference: string): Promise<StoredBundleAllocation[]> {
    const orm = await getAuthOrm(this.config.db);
    const records = await orm.em.fork().find(BundleAllocationRecord, { tenantId, paymentReference }, { orderBy: { createdAt: 'asc' } });
    return records.map(toStored);
  }

  async save(allocation: StoredBundleAllocation): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(BundleAllocationRecord, allocation as unknown as BundleAllocationRecord);
  }

  async countByStatus(tenantId: string): Promise<Record<string, number>> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em.getConnection().execute<Array<{ status: string; count: string }>>(
      'select status, count(*)::int as count from bundle_allocations where tenant_id = ? group by status',
      [tenantId],
    );
    const counts: Record<string, number> = {};
    for (const row of rows) counts[row.status] = Number(row.count);
    return counts;
  }

  async findExpiringWithin(tenantId: string, days: number): Promise<StoredBundleAllocation[]> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em.getConnection().execute<BundleAllocationRecord[]>(
      `select * from bundle_allocations
       where tenant_id = ? and status = 'active' and expires_at >= now() and expires_at <= now() + (? * interval '1 day')`,
      [tenantId, days],
    );
    const em = orm.em.fork();
    return rows.map((r) => toStored(em.map(BundleAllocationRecord, r)));
  }

  async sumDataUsedByBundle(tenantId: string): Promise<Array<{ bundleId: string; usedMb: number; totalMb: number }>> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em.getConnection().execute<Array<{ bundle_id: string; used_mb: string; total_mb: string }>>(
      `select bundle_id, sum(data_used_mb)::numeric as used_mb, sum(data_total_mb)::numeric as total_mb
       from bundle_allocations where tenant_id = ? group by bundle_id`,
      [tenantId],
    );
    return rows.map((r) => ({ bundleId: r.bundle_id, usedMb: Number(r.used_mb), totalMb: Number(r.total_mb) }));
  }
}
