import { Inject, Injectable } from '@nestjs/common';
import { clampPage } from '@auth/onboarding/domain/billing-pricing';
import {
  BILLING_PRICE_CHANGE_REPOSITORY,
  type BillingPriceChangeRepository,
  type PriceChangeItemType,
} from '@auth/onboarding/domain/billing-price-change.repository';
import { success, toPriceChangeView } from './billing-views';

export type ListPriceChangesInput = {
  itemType?: PriceChangeItemType;
  itemRef?: string;
  page?: number;
  limit?: number;
};

@Injectable()
export class ListPriceChangesUseCase {
  constructor(
    @Inject(BILLING_PRICE_CHANGE_REPOSITORY)
    private readonly history: BillingPriceChangeRepository,
  ) {}

  async execute(input: ListPriceChangesInput) {
    const paging = clampPage(input.page, input.limit);
    const { items, total } = await this.history.list({
      itemType: input.itemType,
      itemRef: input.itemRef?.trim() || undefined,
      ...paging,
    });
    return success({ items: items.map(toPriceChangeView), total, ...paging });
  }
}
