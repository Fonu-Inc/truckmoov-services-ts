import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { getAuthOrm } from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type { TenantNameReader } from './tenant-name-reader.port';

const TENANT_NAMES_SQL = `
  select tenant_id, branding->>'organizationName' as organization_name from auth_organization_settings
  union all
  select tenant_id, company->>'companyName' as organization_name from system_tenant_onboardings`;

@Injectable()
export class MikroTenantNameReader implements TenantNameReader {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async organizationNameFor(tenantId: string): Promise<string | null> {
    const orm = await getAuthOrm(this.config.db);
    // Either source may carry the name depending on how the tenant was set up,
    // so both are consulted and branding wins where it exists.
    const rows = await orm.em.getConnection().execute<Array<{ organization_name: string | null }>>(
      `select coalesce(
                (select branding->>'organizationName' from auth_organization_settings where tenant_id = ?),
                (select company->>'companyName' from system_tenant_onboardings where tenant_id = ?)
              ) as organization_name`,
      [tenantId, tenantId],
    );
    return rows[0]?.organization_name ?? null;
  }

  async organizationNamesFor(tenantIds: string[]): Promise<Map<string, string>> {
    if (tenantIds.length === 0) return new Map();
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em.getConnection().execute<Array<{ tenant_id: string; organization_name: string | null }>>(
      `select tenant_id, organization_name from (${TENANT_NAMES_SQL}) names where tenant_id in (?)`,
      [tenantIds],
    );
    return new Map(rows.filter((r) => r.organization_name).map((r) => [r.tenant_id, r.organization_name as string]));
  }

  async tenantIdsMatching(search: string): Promise<string[]> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em.getConnection().execute<Array<{ tenant_id: string }>>(
      `select distinct tenant_id from (${TENANT_NAMES_SQL}) names where organization_name ilike ?`,
      [`%${search}%`],
    );
    return rows.map((r) => r.tenant_id);
  }
}

/** Used on the in-memory backend, where no tenant records exist. */
@Injectable()
export class NoopTenantNameReader implements TenantNameReader {
  async organizationNameFor(): Promise<string | null> {
    return null;
  }

  async organizationNamesFor(): Promise<Map<string, string>> {
    return new Map();
  }

  async tenantIdsMatching(): Promise<string[]> {
    return [];
  }
}
