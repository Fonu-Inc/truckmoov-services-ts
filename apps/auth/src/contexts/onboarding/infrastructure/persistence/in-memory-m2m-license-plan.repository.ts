import { Injectable, Optional } from '@nestjs/common';
import type { StoredBillingPriceChange } from '@auth/onboarding/domain/billing-price-change.repository';
import type {
  M2mLicensePlanFilter,
  M2mLicensePlanRepository,
  PricedPlanEdit,
  PricedPlanEditResult,
  StoredM2mLicensePlan,
} from '@auth/onboarding/domain/m2m-license-plan.repository';
import { InMemoryBillingPriceChangeRepository } from './in-memory-billing-price-change.repository';

function bySortOrder(a: StoredM2mLicensePlan, b: StoredM2mLicensePlan) {
  return a.sortOrder - b.sortOrder || a.code.localeCompare(b.code);
}

@Injectable()
export class InMemoryM2mLicensePlanRepository
  implements M2mLicensePlanRepository
{
  private readonly plans = new Map<string, StoredM2mLicensePlan>();

  constructor(
    @Optional()
    private readonly history: InMemoryBillingPriceChangeRepository = new InMemoryBillingPriceChangeRepository(),
  ) {}

  async save(plan: StoredM2mLicensePlan): Promise<void> {
    this.plans.set(plan.id, { ...plan });
  }

  async editPriced(
    code: string,
    build: (current: StoredM2mLicensePlan) => PricedPlanEdit | null,
  ): Promise<PricedPlanEditResult | null> {
    const before = await this.findByCode(code);
    if (!before) return null;
    const edit = build(before);
    if (!edit) return { before, after: before };
    await this.savePriced(edit.plan, edit.changes);
    return { before, after: edit.plan };
  }

  async savePriced(
    plan: StoredM2mLicensePlan,
    changes: StoredBillingPriceChange[],
  ): Promise<void> {
    await this.save(plan);
    this.history.append(changes);
  }

  async insertIfMissing(plan: StoredM2mLicensePlan): Promise<boolean> {
    if (await this.findByCode(plan.code)) return false;
    await this.save(plan);
    return true;
  }

  async findByCode(code: string): Promise<StoredM2mLicensePlan | null> {
    const found = [...this.plans.values()].find((plan) => plan.code === code);
    return found ? { ...found } : null;
  }

  async findActive(): Promise<StoredM2mLicensePlan[]> {
    return [...this.plans.values()]
      .filter((plan) => plan.isActive)
      .sort(bySortOrder);
  }

  async list(filter: M2mLicensePlanFilter) {
    const term = filter.q?.trim().toLowerCase();
    const matching = [...this.plans.values()]
      .filter((plan) => filter.status !== 'active' || plan.isActive)
      .filter((plan) => filter.status !== 'inactive' || !plan.isActive)
      .filter(
        (plan) =>
          !term ||
          plan.name.toLowerCase().includes(term) ||
          plan.code.toLowerCase().includes(term),
      )
      .sort(bySortOrder);
    const start = (filter.page - 1) * filter.limit;
    return {
      items: matching.slice(start, start + filter.limit).map((p) => ({ ...p })),
      total: matching.length,
    };
  }

  async nextSortOrder(): Promise<number> {
    const orders = [...this.plans.values()].map((plan) => plan.sortOrder);
    return orders.length === 0 ? 1 : Math.max(...orders) + 1;
  }
}
