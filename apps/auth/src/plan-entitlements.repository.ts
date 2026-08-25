import type { PlanEntitlements, UsageItem } from './plan-entitlements';

export type AllowanceUsage = {
  tenantId: string;
  item: UsageItem;
  billingMonth: string;
  used: number;
};

export interface PlanEntitlementsRepository {
  findByPlanCode(planCode: string): Promise<PlanEntitlements | null>;
  findAll(): Promise<PlanEntitlements[]>;
  save(entitlements: PlanEntitlements, updatedBy: string | null): Promise<void>;

  /**
   * Consumes allowance and reports what was left over.
   *
   * Must be atomic. Two concurrent sends would otherwise both read the same
   * remaining allowance and both treat themselves as covered, and the tenant
   * would get more free units than the plan includes.
   */
  consumeAllowance(
    tenantId: string,
    item: UsageItem,
    billingMonth: string,
    requested: number,
    includedPerMonth: number,
  ): Promise<{ covered: number; uncovered: number }>;

  findUsage(tenantId: string, billingMonth: string): Promise<AllowanceUsage[]>;
}

export const PLAN_ENTITLEMENTS_REPOSITORY = Symbol('PLAN_ENTITLEMENTS_REPOSITORY');
