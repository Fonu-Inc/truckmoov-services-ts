import { Injectable } from '@nestjs/common';
import type {
  BillingPriceChangeFilter,
  BillingPriceChangeRepository,
  StoredBillingPriceChange,
} from '@auth/onboarding/domain/billing-price-change.repository';

@Injectable()
export class InMemoryBillingPriceChangeRepository
  implements BillingPriceChangeRepository
{
  private readonly changes: StoredBillingPriceChange[] = [];

  append(changes: StoredBillingPriceChange[]): void {
    this.changes.push(...changes.map((change) => ({ ...change })));
  }

  async list(filter: BillingPriceChangeFilter) {
    const matching = this.changes
      .filter((c) => !filter.itemType || c.itemType === filter.itemType)
      .filter((c) => !filter.itemRef || c.itemRef === filter.itemRef)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const start = (filter.page - 1) * filter.limit;
    return {
      items: matching.slice(start, start + filter.limit),
      total: matching.length,
    };
  }
}
