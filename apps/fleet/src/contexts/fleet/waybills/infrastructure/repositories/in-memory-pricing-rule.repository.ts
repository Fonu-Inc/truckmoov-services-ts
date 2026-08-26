import { Injectable } from "@nestjs/common";
import type { PricingRule } from "../../domain/entities/pricing-rule.entity";
import type { PricingRuleRepository } from "../../domain/repositories/pricing-rule.repository";

@Injectable()
export class InMemoryPricingRuleRepository implements PricingRuleRepository {
  private readonly data = new Map<string, PricingRule>();

  async save(rule: PricingRule): Promise<void> {
    this.data.set(rule.id, rule);
  }

  async findById(id: string, tenantId: string): Promise<PricingRule | null> {
    const rule = this.data.get(id);
    if (!rule || rule.tenantId !== tenantId) return null;
    return rule;
  }

  async findAll(tenantId: string): Promise<PricingRule[]> {
    return [...this.data.values()].filter((rule) => rule.tenantId === tenantId);
  }

  async findActive(tenantId: string): Promise<PricingRule[]> {
    return (await this.findAll(tenantId)).filter((rule) => rule.active);
  }

  async deleteById(id: string, tenantId: string): Promise<void> {
    const rule = this.data.get(id);
    if (!rule || rule.tenantId !== tenantId) return;
    this.data.delete(id);
  }
}
