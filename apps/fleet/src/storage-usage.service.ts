import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { getFleetOrm } from "./contexts/fleet/shared/infrastructure/persistence/fleet-orm";

export const FLEET_STORAGE_CATEGORIES = ["pod", "waybill", "compliance"] as const;
export type FleetStorageCategory = (typeof FLEET_STORAGE_CATEGORIES)[number];

export type StorageCategoryUsage = {
  key: FleetStorageCategory;
  files: number;
  /** Sum of the files whose size is recorded; null when none of them is. */
  bytes: number | null;
  /** Files stored before their size was recorded, left out of bytes. */
  unsizedFiles: number;
};

export type StorageCountRow = { category: string; files: string | number; sized: string | number; bytes: string | number | null };

export function summarizeStorageCategories(rows: StorageCountRow[]): StorageCategoryUsage[] {
  return FLEET_STORAGE_CATEGORIES.map((key) => {
    const row = rows.find((r) => r.category === key);
    const files = Number(row?.files ?? 0);
    const sized = Number(row?.sized ?? 0);
    return {
      key,
      files,
      bytes: files > 0 && sized === 0 ? null : Number(row?.bytes ?? 0),
      unsizedFiles: files - sized,
    };
  });
}

@Injectable()
export class StorageUsageService {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async forTenant(tenantId: string): Promise<StorageCategoryUsage[]> {
    if (this.config.persistence.backend !== "mikro-orm") return summarizeStorageCategories([]);

    const orm = await getFleetOrm(this.config.db);
    // Summed in the database from the sizes recorded at upload; the bucket is never listed.
    const rows = await orm.em.getConnection().execute<StorageCountRow[]>(
      `select 'pod' as category, count(*) as files, count(*) as sized, coalesce(sum("size_bytes"), 0) as bytes
         from "fleet_documents" where "tenant_id" = ? and "doc_type" = 'pod'
       union all
       select 'waybill', count(*), count("image_bytes"), coalesce(sum("image_bytes"), 0)
         from "fleet_waybills" where "tenant_id" = ? and "image_key" is not null
       union all
       select 'compliance', count(*), count("file_size"), coalesce(sum("file_size"), 0)
         from "fleet_compliance_documents" where "tenant_id" = ? and "file_url" is not null`,
      [tenantId, tenantId, tenantId],
    );
    return summarizeStorageCategories(rows);
  }
}
