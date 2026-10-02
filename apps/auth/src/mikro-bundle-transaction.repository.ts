import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  BundleTransactionRecord,
  getAuthOrm,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type {
  BundleTransactionFilters,
  BundleTransactionRepository,
  StoredBundleTransaction,
} from './bundle-transaction.repository';

function toStored(r: BundleTransactionRecord): StoredBundleTransaction {
  return {
    id: r.id,
    tenantId: r.tenantId,
    mobileNumber: r.mobileNumber,
    bundleId: r.bundleId,
    amountKobo: Number(r.amountKobo),
    status: r.status,
    paymentReference: r.paymentReference,
    failureReason: r.failureReason,
    createdAt: r.createdAt,
  };
}

@Injectable()
export class MikroBundleTransactionRepository implements BundleTransactionRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async findAll(filters?: BundleTransactionFilters): Promise<{ items: StoredBundleTransaction[]; total: number }> {
    const orm = await getAuthOrm(this.config.db);
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.tenantId !== undefined) { conditions.push('tenant_id = ?'); params.push(filters.tenantId); }
    if (filters?.status) { conditions.push('status = ?'); params.push(filters.status); }
    if (filters?.bundleIds) {
      if (!filters.bundleIds.length) return { items: [], total: 0 };
      conditions.push(`bundle_id in (${filters.bundleIds.map(() => '?').join(', ')})`);
      params.push(...filters.bundleIds);
    }
    if (filters?.startDate) { conditions.push('created_at >= ?'); params.push(filters.startDate); }
    if (filters?.endDate) { conditions.push('created_at <= ?'); params.push(filters.endDate); }
    if (filters?.search) {
      const q = `%${filters.search}%`;
      conditions.push('(mobile_number ilike ? or id::text ilike ? or payment_reference ilike ?)');
      params.push(q, q, q);
    }

    const where = conditions.length ? `where ${conditions.join(' and ')}` : '';
    const countRows = await orm.em.getConnection().execute<Array<{ count: string }>>(
      `select count(*)::int as count from bundle_transactions ${where}`,
      params,
    );
    const total = Number(countRows[0]?.count ?? 0);

    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 50;
    const offset = (page - 1) * limit;
    const rows = await orm.em.getConnection().execute<BundleTransactionRecord[]>(
      `select * from bundle_transactions ${where} order by created_at desc limit ? offset ?`,
      [...params, limit, offset],
    );
    const em = orm.em.fork();
    return { items: rows.map((r) => toStored(em.map(BundleTransactionRecord, r))), total };
  }

  async save(transaction: StoredBundleTransaction): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(BundleTransactionRecord, transaction as unknown as BundleTransactionRecord);
  }

  async sumByDate(tenantId: string, startDate: Date, endDate: Date): Promise<Array<{ date: string; amountKobo: number }>> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em.getConnection().execute<Array<{ date: string; amount_kobo: string }>>(
      `select to_char(created_at, 'YYYY-MM-DD') as date, sum(amount_kobo)::bigint as amount_kobo
       from bundle_transactions
       where tenant_id = ? and created_at >= ? and created_at <= ?
       group by date order by date asc`,
      [tenantId, startDate, endDate],
    );
    return rows.map((r) => ({ date: r.date, amountKobo: Number(r.amount_kobo) }));
  }

  async sumByBundle(tenantId: string, startDate: Date, endDate: Date): Promise<Array<{ bundleId: string; amountKobo: number }>> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em.getConnection().execute<Array<{ bundle_id: string; amount_kobo: string }>>(
      `select bundle_id, sum(amount_kobo)::bigint as amount_kobo
       from bundle_transactions
       where tenant_id = ? and created_at >= ? and created_at <= ?
       group by bundle_id`,
      [tenantId, startDate, endDate],
    );
    return rows.map((r) => ({ bundleId: r.bundle_id, amountKobo: Number(r.amount_kobo) }));
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
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em.getConnection().execute<Array<{ total: string }>>(
      `select coalesce(sum(amount_kobo), 0)::bigint as total
       from bundle_transactions
       where tenant_id = ? and status = 'success'
         and extract(year from created_at) = ? and extract(month from created_at) = ?`,
      [tenantId, year, month],
    );
    return Number(rows[0]?.total ?? 0);
  }

  async countByTenantAndMonth(tenantId: string, year: number, month: number): Promise<number> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em.getConnection().execute<Array<{ count: string }>>(
      `select count(*)::int as count
       from bundle_transactions
       where tenant_id = ? and status = 'success'
         and extract(year from created_at) = ? and extract(month from created_at) = ?`,
      [tenantId, year, month],
    );
    return Number(rows[0]?.count ?? 0);
  }
}
