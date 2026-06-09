import { Injectable } from '@nestjs/common';
import {
  type StoredSubscriptionPlan,
  type SubscriptionPlanRepository,
  type SubscriptionPlanTier,
} from './subscription-plan.repository';

const TIER_ORDER: Record<SubscriptionPlanTier, number> = {
  starter: 0,
  professional: 1,
  enterprise: 2,
};

@Injectable()
export class InMemorySubscriptionPlanRepository
  implements SubscriptionPlanRepository
{
  private readonly store = new Map<string, StoredSubscriptionPlan>();

  async save(plan: StoredSubscriptionPlan): Promise<void> {
    this.store.set(plan.id, plan);
  }

  async findById(id: string): Promise<StoredSubscriptionPlan | null> {
    return this.store.get(id) ?? null;
  }

  async findByCode(code: string): Promise<StoredSubscriptionPlan | null> {
    const normalized = code.trim();
    for (const plan of this.store.values()) {
      if (plan.code === normalized) {
        return plan;
      }
    }
    return null;
  }

  async findByTier(
    tier: SubscriptionPlanTier,
  ): Promise<StoredSubscriptionPlan | null> {
    return (
      (await this.findAll()).find(
        (plan) => plan.tier === tier && plan.isActive,
      ) ?? null
    );
  }

  async findAll(): Promise<StoredSubscriptionPlan[]> {
    return [...this.store.values()].sort(
      (left, right) =>
        TIER_ORDER[left.tier] - TIER_ORDER[right.tier] ||
        left.name.localeCompare(right.name),
    );
  }

  async count(): Promise<number> {
    return this.store.size;
  }
}
