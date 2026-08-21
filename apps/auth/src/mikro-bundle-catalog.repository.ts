import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  BundleCatalogRecord,
  getAuthOrm,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type { BundleCatalogFilters, BundleCatalogRepository, StoredBundleCatalog } from './bundle-catalog.repository';

function toStored(r: BundleCatalogRecord): StoredBundleCatalog {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    carrierId: r.carrierId,
    dataAmountGb: r.dataAmountGb,
    validityDays: r.validityDays,
    billingCycle: r.billingCycle,
    priceKobo: r.priceKobo,
    currency: r.currency,
    active: r.active,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

@Injectable()
export class MikroBundleCatalogRepository implements BundleCatalogRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async findAll(filters?: BundleCatalogFilters): Promise<{ items: StoredBundleCatalog[]; total: number }> {
    const orm = await getAuthOrm(this.config.db);
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.carrierId) { conditions.push('carrier_id = ?'); params.push(filters.carrierId); }
    if (filters?.billingCycle) { conditions.push('billing_cycle = ?'); params.push(filters.billingCycle); }
    if (filters?.activeOnly) { conditions.push('active = true'); }
    if (filters?.active !== undefined) { conditions.push('active = ?'); params.push(filters.active); }
    if (filters?.search) {
      const q = `%${filters.search}%`;
      conditions.push('(name ilike ? or code ilike ?)');
      params.push(q, q);
    }

    const where = conditions.length ? `where ${conditions.join(' and ')}` : '';
    const countRows = await orm.em.getConnection().execute<Array<{ count: string }>>(
      `select count(*)::int as count from bundle_catalogs ${where}`,
      params,
    );
    const total = Number(countRows[0]?.count ?? 0);

    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 50;
    const offset = (page - 1) * limit;
    const rows = await orm.em.getConnection().execute<BundleCatalogRecord[]>(
      `select * from bundle_catalogs ${where} order by name asc limit ? offset ?`,
      [...params, limit, offset],
    );
    return { items: rows.map((r) => toStored(r as unknown as BundleCatalogRecord)), total };
  }

  async findById(id: string): Promise<StoredBundleCatalog | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(BundleCatalogRecord, { id });
    return record ? toStored(record) : null;
  }

  async save(bundle: StoredBundleCatalog): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(BundleCatalogRecord, bundle as unknown as BundleCatalogRecord);
  }

  async delete(id: string): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.nativeDelete(BundleCatalogRecord, { id });
  }
}
