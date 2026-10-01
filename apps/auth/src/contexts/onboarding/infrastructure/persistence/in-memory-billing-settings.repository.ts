import { Injectable, Optional } from '@nestjs/common';
import type { StoredBillingPriceChange } from '@auth/onboarding/domain/billing-price-change.repository';
import type {
  BillingSettingUpdate,
  BillingSettingsRepository,
  PricedSettingsEdit,
  StoredBillingSetting,
} from '@auth/onboarding/domain/billing-settings.repository';
import { InMemoryBillingPriceChangeRepository } from './in-memory-billing-price-change.repository';

@Injectable()
export class InMemoryBillingSettingsRepository
  implements BillingSettingsRepository
{
  private readonly settings = new Map<string, StoredBillingSetting>();

  constructor(
    @Optional()
    private readonly history: InMemoryBillingPriceChangeRepository = new InMemoryBillingPriceChangeRepository(),
  ) {}

  async getAll(): Promise<Record<string, StoredBillingSetting>> {
    return Object.fromEntries(
      [...this.settings.entries()].map(([key, value]) => [key, { ...value }]),
    );
  }

  async editPriced(
    updatedBy: string,
    build: (current: Record<string, StoredBillingSetting>) => PricedSettingsEdit | null,
  ): Promise<void> {
    const edit = build(await this.getAll());
    if (edit) await this.savePriced(edit.updates, updatedBy, edit.changes);
  }

  async savePriced(
    updates: BillingSettingUpdate[],
    updatedBy: string,
    changes: StoredBillingPriceChange[],
  ): Promise<void> {
    const now = new Date();
    for (const update of updates) {
      this.settings.set(update.key, { ...update, updatedAt: now, updatedBy });
    }
    this.history.append(changes);
  }
}
