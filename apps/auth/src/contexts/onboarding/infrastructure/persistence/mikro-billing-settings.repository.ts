import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from '@mikro-orm/core';
import { AppConfigService } from '@shared/config';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';
import type { StoredBillingPriceChange } from '@auth/onboarding/domain/billing-price-change.repository';
import type {
  BillingSettingUpdate,
  BillingSettingsRepository,
  PricedSettingsEdit,
  StoredBillingSetting,
} from '@auth/onboarding/domain/billing-settings.repository';
import { BillingSettingRecord } from './onboarding-orm';
import { toPriceChangeRecord, toSetting } from './mikro-billing-mappers';

const SETTINGS_LOCK_KEY = 'billing_settings';

async function lockSettings(tx: EntityManager) {
  await tx
    .getConnection()
    .execute(
      `select pg_advisory_xact_lock(hashtext(?))`,
      [SETTINGS_LOCK_KEY],
      'all',
      tx.getTransactionContext(),
    );
}

async function writeUpdates(
  tx: EntityManager,
  updates: BillingSettingUpdate[],
  updatedBy: string,
) {
  for (const update of updates) {
    const existing = await tx.findOne(BillingSettingRecord, { key: update.key });
    const target = existing ?? new BillingSettingRecord();
    target.key = update.key;
    target.valueJson = update.value;
    target.updatedAt = new Date();
    target.updatedBy = updatedBy;
    if (!existing) tx.persist(target);
  }
}

@Injectable()
export class MikroBillingSettingsRepository
  implements BillingSettingsRepository
{
  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async getAll(): Promise<Record<string, StoredBillingSetting>> {
    const orm = await getAuthOrm(this.config.db);
    const records = await orm.em.fork().find(BillingSettingRecord, {});
    return Object.fromEntries(
      records.map((record) => [record.key, toSetting(record)]),
    );
  }

  async editPriced(
    updatedBy: string,
    build: (current: Record<string, StoredBillingSetting>) => PricedSettingsEdit | null,
  ): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    await orm.em.fork().transactional(async (tx) => {
      await lockSettings(tx);
      const records = await tx.find(BillingSettingRecord, {});
      const edit = build(
        Object.fromEntries(records.map((record) => [record.key, toSetting(record)])),
      );
      if (!edit) return;
      await writeUpdates(tx, edit.updates, updatedBy);
      for (const change of edit.changes) tx.persist(toPriceChangeRecord(change));
    });
  }

  async savePriced(
    updates: BillingSettingUpdate[],
    updatedBy: string,
    changes: StoredBillingPriceChange[],
  ): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    await orm.em.fork().transactional(async (tx) => {
      await lockSettings(tx);
      await writeUpdates(tx, updates, updatedBy);
      for (const change of changes) tx.persist(toPriceChangeRecord(change));
    });
  }
}
