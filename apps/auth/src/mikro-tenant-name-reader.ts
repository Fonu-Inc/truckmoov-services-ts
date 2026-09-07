import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { getAuthOrm } from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type { TenantNameReader } from './tenant-name-reader.port';

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
}

/** Used on the in-memory backend, where no tenant records exist. */
@Injectable()
export class NoopTenantNameReader implements TenantNameReader {
  async organizationNameFor(): Promise<string | null> {
    return null;
  }
}
