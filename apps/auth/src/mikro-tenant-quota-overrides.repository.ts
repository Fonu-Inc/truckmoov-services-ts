import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';
import {
  noQuotaOverrides,
  type QuotaOverrides,
  type TenantQuotaOverridesRepository,
} from './tenant-quota-overrides.repository';

type Row = Record<string, unknown>;

const toLimit = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

function toOverrides(row: Row): QuotaOverrides {
  return {
    vehicles: toLimit(row.vehicles),
    drivers: toLimit(row.drivers),
    devices: toLimit(row.devices),
    sims: toLimit(row.sims),
  };
}

@Injectable()
export class MikroTenantQuotaOverridesRepository implements TenantQuotaOverridesRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async findByTenant(tenantId: string): Promise<QuotaOverrides> {
    const rows = await this.execute(
      'select vehicles, drivers, devices, sims from tenant_quota_overrides where tenant_id = ?',
      [tenantId],
    );
    return rows[0] ? toOverrides(rows[0]) : noQuotaOverrides();
  }

  async findAll(): Promise<Map<string, QuotaOverrides>> {
    const rows = await this.execute('select tenant_id, vehicles, drivers, devices, sims from tenant_quota_overrides');
    return new Map(rows.map((row) => [String(row.tenant_id), toOverrides(row)]));
  }

  async save(tenantId: string, overrides: QuotaOverrides, updatedBy: string): Promise<void> {
    await this.execute(
      `insert into tenant_quota_overrides (tenant_id, vehicles, drivers, devices, sims, updated_by, updated_at)
       values (?, ?, ?, ?, ?, ?, now())
       on conflict (tenant_id) do update set vehicles = excluded.vehicles, drivers = excluded.drivers,
         devices = excluded.devices, sims = excluded.sims, updated_by = excluded.updated_by, updated_at = now()`,
      [tenantId, overrides.vehicles, overrides.drivers, overrides.devices, overrides.sims, updatedBy],
    );
  }

  private async execute(sql: string, params: unknown[] = []): Promise<Row[]> {
    const orm = await getAuthOrm(this.config.db);
    return (await orm.em.fork().getConnection().execute(sql, params)) as Row[];
  }
}
