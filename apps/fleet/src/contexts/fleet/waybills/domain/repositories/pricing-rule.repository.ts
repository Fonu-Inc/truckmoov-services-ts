import type { PricingRule } from "../entities/pricing-rule.entity";

export interface PricingRuleRepository {
  save(rule: PricingRule): Promise<void>;
  findById(id: string, tenantId: string): Promise<PricingRule | null>;
  findAll(tenantId: string): Promise<PricingRule[]>;
  /** Active rules only, for pricing. Inactive rules never price anything new. */
  findActive(tenantId: string): Promise<PricingRule[]>;
  deleteById(id: string, tenantId: string): Promise<void>;
}

export const PRICING_RULE_REPOSITORY = Symbol("PRICING_RULE_REPOSITORY");
