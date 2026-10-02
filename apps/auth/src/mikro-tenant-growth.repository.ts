import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { SYSTEM_TENANT_ID } from '@shared/identity';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';
import type { TenantGrowthRepository } from './tenant-growth.repository';

type Row = Record<string, unknown>;

@Injectable()
export class MikroTenantGrowthRepository implements TenantGrowthRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async tenantsCreatedByLagosMonth(): Promise<Map<string, number>> {
    const connection = (await getAuthOrm(this.config.db)).em.fork().getConnection();
    const exists = await connection.execute<Row[]>(
      "select exists(select 1 from information_schema.tables where table_schema = 'public' and table_name = 'system_tenant_onboardings') as exists",
    );
    const hasOnboardings = exists[0]?.exists === true;
    const rows = hasOnboardings
      ? await connection.execute<Row[]>(this.sql(true), [SYSTEM_TENANT_ID, SYSTEM_TENANT_ID])
      : await connection.execute<Row[]>(this.sql(false), [SYSTEM_TENANT_ID]);
    return new Map(rows.map((row) => [String(row.month), Number(row.count)]));
  }

  private sql(withOnboardings: boolean) {
    const users = `select tenant_id, min(created_at) as created_at from auth_users where tenant_id <> ?
      ${withOnboardings ? 'and tenant_id not in (select tenant_id from system_tenant_onboardings)' : ''} group by tenant_id`;
    const created = withOnboardings
      ? `select tenant_id, min(created_at) as created_at from system_tenant_onboardings where tenant_id <> ? group by tenant_id
         union all ${users}`
      : users;
    return `select to_char(created_at at time zone 'Africa/Lagos', 'YYYY-MM') as month, count(*)::int as count
              from (${created}) tenants group by 1`;
  }
}
