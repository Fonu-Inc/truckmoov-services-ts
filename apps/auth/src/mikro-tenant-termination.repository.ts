import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  getAuthOrm,
  TenantTerminationRecord,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type {
  StoredTenantTermination,
  TenantTerminationRepository,
} from './tenant-termination.repository';

@Injectable()
export class MikroTenantTerminationRepository implements TenantTerminationRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async findByTenantId(tenantId: string): Promise<StoredTenantTermination | null> {
    const em = await this.em();
    const record = await em.findOne(TenantTerminationRecord, { tenantId });
    return record ? { ...record } : null;
  }

  async listTenantIds(): Promise<string[]> {
    const em = await this.em();
    const records = await em.find(TenantTerminationRecord, {});
    return records.map((record) => record.tenantId);
  }

  async save(termination: StoredTenantTermination): Promise<void> {
    const em = await this.em();
    await em.upsert(TenantTerminationRecord, { ...termination });
  }

  private async em() {
    const orm = await getAuthOrm(this.config.db);
    return orm.em.fork();
  }
}

@Injectable()
export class InMemoryTenantTerminationRepository implements TenantTerminationRepository {
  private readonly store = new Map<string, StoredTenantTermination>();

  async findByTenantId(tenantId: string): Promise<StoredTenantTermination | null> {
    return this.store.get(tenantId) ?? null;
  }

  async listTenantIds(): Promise<string[]> {
    return [...this.store.keys()];
  }

  async save(termination: StoredTenantTermination): Promise<void> {
    this.store.set(termination.tenantId, { ...termination });
  }
}
