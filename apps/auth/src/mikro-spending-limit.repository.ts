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
    monthlyLimitKobo: Number(r.monthlyLimitKobo),
    spentThisMonthKobo: Number(r.spentThisMonthKobo),
    resetDayOfMonth: r.resetDayOfMonth,
    alertEmail: r.alertEmail,
    notifyAtPercentages: r.notifyAtPercentages as number[],
    windowStartedOn: r.windowStartedOn ?? null,
    notifiedPercentages: (r.notifiedPercentages as number[]) ?? [],
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

  async addSpend(tenantId: string, amountKobo: number, windowStartedOn: string): Promise<StoredSpendingLimit | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    // SET expressions read the row as it was, so the window check sees the old window.
    const rows = await em.getConnection().execute(
      `update spending_limit_settings
          set spent_this_month_kobo = (case when window_started_on = ? then spent_this_month_kobo else 0 end) + ?,
              notified_percentages = case when window_started_on = ? then notified_percentages else '[]'::jsonb end,
              window_started_on = ?,
              updated_at = now()
        where tenant_id = ? and enabled
        returning *`,
      [windowStartedOn, amountKobo, windowStartedOn, windowStartedOn, tenantId],
    );
    return rows[0] ? toStored(em.map(SpendingLimitSettingsRecord, rows[0])) : null;
  }

  async markNotified(tenantId: string, windowStartedOn: string, percentages: number[]): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    await orm.em.fork().getConnection().execute(
      `update spending_limit_settings
          set notified_percentages = notified_percentages || ?::jsonb
        where tenant_id = ? and window_started_on = ?`,
      [JSON.stringify(percentages), tenantId, windowStartedOn],
    );
  }

  async deleteByTenantId(tenantId: string): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.nativeDelete(SpendingLimitSettingsRecord, { tenantId });
  }
}
