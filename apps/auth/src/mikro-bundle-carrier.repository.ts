import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  BundleCarrierRecord,
  getAuthOrm,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type { BundleCarrierRepository, StoredBundleCarrier } from './bundle-carrier.repository';

function toStored(r: BundleCarrierRecord): StoredBundleCarrier {
  return {
    id: r.id,
    name: r.name,
    displayName: r.displayName,
    active: r.active,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

@Injectable()
export class MikroBundleCarrierRepository implements BundleCarrierRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async findAll(activeOnly?: boolean): Promise<StoredBundleCarrier[]> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const where = activeOnly ? { active: true } : {};
    const records = await em.find(BundleCarrierRecord, where, { orderBy: { name: 'asc' } });
    return records.map(toStored);
  }

  async findById(id: string): Promise<StoredBundleCarrier | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(BundleCarrierRecord, { id });
    return record ? toStored(record) : null;
  }

  async save(carrier: StoredBundleCarrier): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(BundleCarrierRecord, carrier as unknown as BundleCarrierRecord);
  }

  async delete(id: string): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.nativeDelete(BundleCarrierRecord, { id });
  }
}
