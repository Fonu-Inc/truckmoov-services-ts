import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  type OrganizationSettings,
  type OrganizationSettingsRepository,
} from '../domain/ports/organization-settings.repository.port';
import { OrganizationSettingsRecord, getAuthOrm } from './persistence/auth-orm';

@Injectable()
export class MikroOrganizationSettingsRepository implements OrganizationSettingsRepository {
  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async findByTenantId(tenantId: string): Promise<OrganizationSettings | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(OrganizationSettingsRecord, { tenantId });
    return record as OrganizationSettings | null;
  }

  async save(settings: OrganizationSettings): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(OrganizationSettingsRecord, {
      ...settings,
      updatedAt: new Date(),
    });
  }

  async deleteByTenantId(tenantId: string): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.nativeDelete(OrganizationSettingsRecord, { tenantId });
  }
}
