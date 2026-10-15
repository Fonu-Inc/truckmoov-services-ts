import { Inject, Injectable } from "@nestjs/common";
import { FLEET_RUNTIME, type FleetRuntime } from "@fleet/shared/domain/ports/fleet-runtime.port";
import { FleetRuleError } from "../../../shared/domain/errors/fleet-rule.error";
import { PricingRule, type PricingMode } from "../../domain/entities/pricing-rule.entity";
import {
  PRICING_RULE_REPOSITORY,
  type PricingRuleRepository,
} from "../../domain/repositories/pricing-rule.repository";
import { lagosToday } from "../../../../../utils/lagos-date";

export class PricingRuleNotFoundError extends Error {
  constructor(id: string) {
    super(`Pricing rule ${id} not found`);
    this.name = "PricingRuleNotFoundError";
  }
}

export type SavePricingRuleCommand = {
  tenantId: string;
  id?: string;
  name: string;
  origin?: string | null;
  destination: string;
  destinationAliases?: string[];
  mode: PricingMode;
  flatPriceKobo?: number | null;
  pricePerUnitKobo?: number | null;
  unitType?: string | null;
  minimumChargeKobo?: number | null;
  vehicleType?: string | null;
  customerName?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  active?: boolean;
};

@Injectable()
export class SavePricingRuleUseCase {
  constructor(
    @Inject(PRICING_RULE_REPOSITORY) private readonly rules: PricingRuleRepository,
    @Inject(FLEET_RUNTIME) private readonly runtime: FleetRuntime,
  ) {}

  async execute(command: SavePricingRuleCommand): Promise<PricingRule> {
    const existing = command.id
      ? await this.rules.findById(command.id, command.tenantId)
      : null;
    if (command.id && !existing) throw new PricingRuleNotFoundError(command.id);

    const rule = PricingRule.create({
      id: existing?.id ?? this.runtime.generateId(),
      tenantId: command.tenantId,
      name: command.name,
      origin: command.origin ?? null,
      destination: command.destination,
      destinationAliases: command.destinationAliases ?? [],
      mode: command.mode,
      currency: "NGN",
      flatPriceKobo: command.flatPriceKobo ?? null,
      pricePerUnitKobo: command.pricePerUnitKobo ?? null,
      unitType: command.unitType ?? null,
      minimumChargeKobo: command.minimumChargeKobo ?? null,
      vehicleType: command.vehicleType ?? null,
      customerName: command.customerName ?? null,
      effectiveFrom: command.effectiveFrom ?? null,
      effectiveTo: command.effectiveTo ?? null,
      active: command.active ?? existing?.active ?? true,
      createdAt: existing?.createdAt,
      updatedAt: new Date().toISOString(),
    });

    await this.rules.save(rule);
    return rule;
  }
}

@Injectable()
export class DeactivatePricingRuleUseCase {
  constructor(
    @Inject(PRICING_RULE_REPOSITORY) private readonly rules: PricingRuleRepository,
  ) {}

  /**
   * Stops a rule pricing anything new.
   *
   * Waybills it already priced keep their price: the amount and the rule id are
   * stored on the waybill, and nothing recomputes them. A customer already told
   * what they owe is not told something different because a rule was retired.
   */
  async execute(input: { id: string; tenantId: string }): Promise<PricingRule> {
    const rule = await this.rules.findById(input.id, input.tenantId);
    if (!rule) throw new PricingRuleNotFoundError(input.id);
    if (!rule.active) throw new FleetRuleError("this rule is already inactive");

    const deactivated = rule.deactivate();
    await this.rules.save(deactivated);
    return deactivated;
  }
}

@Injectable()
export class ListPricingRulesUseCase {
  constructor(
    @Inject(PRICING_RULE_REPOSITORY) private readonly rules: PricingRuleRepository,
  ) {}

  async execute(tenantId: string, query?: string, now = new Date()) {
    return pricingRulesView(await this.rules.findAll(tenantId), query, now);
  }
}

export function pricingRulesView(all: PricingRule[], query?: string, now = new Date()) {
  const search = query?.trim().toLowerCase();
  const today = lagosToday(now);

  const filtered = !search
    ? all
    : all.filter((rule) =>
        [rule.name, rule.destination, rule.origin, rule.customerName, rule.vehicleType]
          .some((value) => (value ?? "").toLowerCase().includes(search)),
      );

  return {
    summary: {
      totalRules: all.length,
      // "Active" means both flagged active and inside its window today.
      activeRules: all.filter((rule) => rule.active && rule.wasEffectiveOn(today)).length,
      flatRateRules: all.filter((rule) => rule.mode === "flat").length,
      perWeightRules: all.filter((rule) => rule.mode === "per_unit").length,
    },
    rules: filtered.map(toPricingRuleRow),
  };
}

export function toPricingRuleRow(rule: PricingRule) {
  return {
    id: rule.id,
    name: rule.name,
    origin: rule.origin,
    destination: rule.destination,
    destinationAliases: rule.destinationAliases,
    mode: rule.mode,
    currency: rule.currency,
    flatPriceKobo: rule.flatPriceKobo,
    pricePerUnitKobo: rule.pricePerUnitKobo,
    unitType: rule.unitType,
    minimumChargeKobo: rule.minimumChargeKobo,
    vehicleType: rule.vehicleType,
    customerName: rule.customerName,
    effectiveFrom: rule.effectiveFrom,
    effectiveTo: rule.effectiveTo,
    status: rule.active ? "active" : "inactive",
  };
}
