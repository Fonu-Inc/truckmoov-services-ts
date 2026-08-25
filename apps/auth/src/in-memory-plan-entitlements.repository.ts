import { Injectable } from '@nestjs/common';
import type { PlanEntitlements, UsageItem } from './plan-entitlements';
import type {
  AllowanceUsage,
  PlanEntitlementsRepository,
} from './plan-entitlements.repository';

@Injectable()
export class InMemoryPlanEntitlementsRepository implements PlanEntitlementsRepository {
  private readonly byPlanCode = new Map<string, PlanEntitlements>();
  private readonly usage = new Map<string, number>();

  private usageKey(tenantId: string, item: UsageItem, billingMonth: string) {
    return `${tenantId}::${item}::${billingMonth}`;
  }

  async findByPlanCode(planCode: string): Promise<PlanEntitlements | null> {
    const found = this.byPlanCode.get(planCode);
    return found ? structuredClone(found) : null;
  }

  async findAll(): Promise<PlanEntitlements[]> {
    return [...this.byPlanCode.values()].map((plan) => structuredClone(plan));
  }

  async save(entitlements: PlanEntitlements): Promise<void> {
    this.byPlanCode.set(entitlements.planCode, structuredClone(entitlements));
  }

  async consumeAllowance(
    tenantId: string,
    item: UsageItem,
    billingMonth: string,
    requested: number,
    includedPerMonth: number,
  ): Promise<{ covered: number; uncovered: number }> {
    if (includedPerMonth <= 0 || requested <= 0) {
      return { covered: 0, uncovered: Math.max(0, requested) };
    }

    const key = this.usageKey(tenantId, item, billingMonth);
    const used = this.usage.get(key) ?? 0;
    const covered = Math.min(requested, Math.max(0, includedPerMonth - used));

    if (covered > 0) this.usage.set(key, used + covered);
    return { covered, uncovered: requested - covered };
  }

  async findUsage(tenantId: string, billingMonth: string): Promise<AllowanceUsage[]> {
    const prefix = `${tenantId}::`;
    const suffix = `::${billingMonth}`;
    return [...this.usage.entries()]
      .filter(([key]) => key.startsWith(prefix) && key.endsWith(suffix))
      .map(([key, used]) => ({
        tenantId,
        item: key.slice(prefix.length, key.length - suffix.length) as UsageItem,
        billingMonth,
        used,
      }));
  }
}
