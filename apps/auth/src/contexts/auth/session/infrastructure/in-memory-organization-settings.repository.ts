import { Injectable } from '@nestjs/common';
import {
  type OrganizationSettings,
  type OrganizationSettingsRepository,
} from '../domain/ports/organization-settings.repository.port';

@Injectable()
export class InMemoryOrganizationSettingsRepository implements OrganizationSettingsRepository {
  private readonly store = new Map<string, OrganizationSettings>();

  async findByTenantId(tenantId: string): Promise<OrganizationSettings | null> {
    return this.store.get(tenantId) ?? null;
  }

  async save(settings: OrganizationSettings): Promise<void> {
    this.store.set(settings.tenantId, settings);
  }

  async deleteByTenantId(tenantId: string): Promise<void> {
    this.store.delete(tenantId);
  }
}
