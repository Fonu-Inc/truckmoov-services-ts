import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  TenantStorageUsageRecord,
  getAuthOrm,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type {
  StorageSource,
  StorageUsage,
  StorageUsageRepository,
} from './storage-usage.repository';

@Injectable()
export class MikroStorageUsageRepository implements StorageUsageRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  /**
   * One statement. Two uploads finishing together would otherwise both read the
   * same total and both write their own, and one upload's bytes would vanish
   * from the count.
   *
   * Clamped at zero: a double-counted delete must not drive a tenant negative
   * and hand them free capacity.
   */
  async addBytes(tenantId: string, source: StorageSource, deltaBytes: number): Promise<void> {
    if (deltaBytes === 0) return;

    const orm = await getAuthOrm(this.config.db);
    await orm.em.getConnection().execute(
      `insert into "tenant_storage_usage" ("tenant_id", "source", "bytes_used")
         values (?, ?, greatest(0, ?))
       on conflict ("tenant_id", "source") do update
         set "bytes_used" = greatest(0, "tenant_storage_usage"."bytes_used" + ?),
             "updated_at" = now()`,
      [tenantId, source, deltaBytes, deltaBytes],
    );
  }

  async setBytes(tenantId: string, source: StorageSource, bytesUsed: number): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    await orm.em.getConnection().execute(
      `insert into "tenant_storage_usage" ("tenant_id", "source", "bytes_used", "reconciled_at")
         values (?, ?, greatest(0, ?), now())
       on conflict ("tenant_id", "source") do update
         set "bytes_used" = greatest(0, excluded."bytes_used"),
             "reconciled_at" = now(),
             "updated_at" = now()`,
      [tenantId, source, bytesUsed],
    );
  }

  async totalBytes(tenantId: string): Promise<number> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em.getConnection().execute<Array<{ total: string | null }>>(
      `select coalesce(sum("bytes_used"), 0) as total
         from "tenant_storage_usage" where "tenant_id" = ?`,
      [tenantId],
    );
    return Number(rows[0]?.total ?? 0);
  }

  async breakdown(tenantId: string): Promise<StorageUsage[]> {
    const orm = await getAuthOrm(this.config.db);
    const records = await orm.em.fork().find(TenantStorageUsageRecord, { tenantId } as never);
    return records.map((record) => ({
      tenantId: record.tenantId,
      source: record.source as StorageSource,
      bytesUsed: Number(record.bytesUsed),
    }));
  }
}
