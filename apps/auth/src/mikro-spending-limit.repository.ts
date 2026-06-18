import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  SpendingLimitSettingsRecord,
  getAuthOrm,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type { SpendingLimitRepository, StoredSpendingLimit } from './spending-limit.repository';

function toStored(r: SpendingLimitSettingsRecord): StoredSpendingLimit {
  return {
    tenantId: r.tenantId,
    enabled: r.enabled,
    monthlyLimitKobo: r.monthlyLimitKobo,
    spentThisMonthKobo: r.spentThisMonthKobo,
    resetDayOfMonth: r.resetDayOfMonth,
    alertEmail: r.alertEmail,
    notifyAtPercentages: r.notifyAtPercentages as number[],
    updatedAt: r.updatedAt,
  };
}

@Injectable()
export class MikroSpendingLimitRepository implements SpendingLimitRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async findByTenantId(tenantId: string): Promise<StoredSpendingLimit | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(SpendingLimitSettingsRecord, { tenantId });
    return record ? toStored(record) : null;
  }

  async save(settings: StoredSpendingLimit): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(SpendingLimitSettingsRecord, settings as unknown as SpendingLimitSettingsRecord);
  }

  async deleteByTenantId(tenantId: string): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.nativeDelete(SpendingLimitSettingsRecord, { tenantId });
  }
}
