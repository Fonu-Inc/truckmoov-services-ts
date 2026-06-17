import { Injectable } from '@nestjs/common';
import type {
  StoredTenantBusinessInfo,
  TenantBusinessInfoRepository,
} from './tenant-business-info.repository';

@Injectable()
export class InMemoryTenantBusinessInfoRepository
  implements TenantBusinessInfoRepository
{
  private readonly store = new Map<string, StoredTenantBusinessInfo>();

  async findByTenantId(tenantId: string): Promise<StoredTenantBusinessInfo | null> {
    return this.store.get(tenantId) ?? null;
  }

  async save(info: StoredTenantBusinessInfo): Promise<void> {
    this.store.set(info.tenantId, info);
  }
}
