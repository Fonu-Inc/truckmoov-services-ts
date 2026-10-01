import { Inject, Injectable } from '@nestjs/common';
import { BillingNotFoundError } from '@auth/onboarding/domain/billing-errors';
import { clampPage } from '@auth/onboarding/domain/billing-pricing';
import {
  BILLING_PRICE_CHANGE_REPOSITORY,
  type BillingPriceChangeRepository,
} from '@auth/onboarding/domain/billing-price-change.repository';
import {
  M2M_LICENSE_PLAN_REPOSITORY,
  type M2mLicensePlanRepository,
} from '@auth/onboarding/domain/m2m-license-plan.repository';
import { success, toPlanView, toPriceChangeView } from './billing-views';

const RECENT_HISTORY_LIMIT = 10;

export type ListLicensePlansInput = {
  q?: string;
  status?: 'all' | 'active' | 'inactive';
  page?: number;
  limit?: number;
};

@Injectable()
export class ListLicensePlansUseCase {
  constructor(
    @Inject(M2M_LICENSE_PLAN_REPOSITORY)
    private readonly plans: M2mLicensePlanRepository,
  ) {}

  async execute(input: ListLicensePlansInput) {
    const paging = clampPage(input.page, input.limit);
    const { items, total } = await this.plans.list({
      q: input.q,
      status: input.status ?? 'all',
      ...paging,
    });
    return success({ items: items.map(toPlanView), total, ...paging });
  }
}

@Injectable()
export class GetLicensePlanUseCase {
  constructor(
    @Inject(M2M_LICENSE_PLAN_REPOSITORY)
    private readonly plans: M2mLicensePlanRepository,
    @Inject(BILLING_PRICE_CHANGE_REPOSITORY)
    private readonly history: BillingPriceChangeRepository,
  ) {}

  async execute(code: string) {
    const plan = await this.plans.findByCode(code);
    if (!plan) throw new BillingNotFoundError('Plan not found');

    const recent = await this.history.list({
      itemType: 'm2m_plan',
      itemRef: plan.code,
      page: 1,
      limit: RECENT_HISTORY_LIMIT,
    });
    return success({
      plan: toPlanView(plan),
      priceHistory: recent.items.map(toPriceChangeView),
    });
  }
}
