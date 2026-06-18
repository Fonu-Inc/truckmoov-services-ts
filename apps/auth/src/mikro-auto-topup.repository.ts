import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  AutoTopUpSettingsRecord,
  getAuthOrm,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type { AutoTopUpRepository, StoredAutoTopUp } from './auto-topup.repository';

function toStored(r: AutoTopUpSettingsRecord): StoredAutoTopUp {
  return {
    tenantId: r.tenantId,
    enabled: r.enabled,
    thresholdKobo: r.thresholdKobo,
    topupAmountKobo: r.topupAmountKobo,
    paymentProvider: r.paymentProvider,
    mobileNumber: r.mobileNumber,
    updatedAt: r.updatedAt,
  };
}

@Injectable()
export class MikroAutoTopUpRepository implements AutoTopUpRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async findByTenantId(tenantId: string): Promise<StoredAutoTopUp | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(AutoTopUpSettingsRecord, { tenantId });
    return record ? toStored(record) : null;
  }

  async save(settings: StoredAutoTopUp): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(AutoTopUpSettingsRecord, settings as unknown as AutoTopUpSettingsRecord);
  }

  async deleteByTenantId(tenantId: string): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.nativeDelete(AutoTopUpSettingsRecord, { tenantId });
  }
}
