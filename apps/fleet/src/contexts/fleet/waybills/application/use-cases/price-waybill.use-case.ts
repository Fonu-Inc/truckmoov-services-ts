import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Waybill } from "../../domain/entities/waybill.entity";
import { findBestPricingRule } from "../../domain/entities/pricing-rule-match";
import {
  PRICING_RULE_REPOSITORY,
  type PricingRuleRepository,
} from "../../domain/repositories/pricing-rule.repository";
import {
  WAYBILL_REPOSITORY,
  type WaybillRepository,
} from "../../domain/repositories/waybill.repository";

/**
 * Puts a price on a waybill from the best-matching rule.
 *
 * A waybill that no rule covers is left alone rather than being priced at zero.
 * Zero is a real price a tenant might genuinely charge, so it must not double
 * as "we could not work this out".
 */
@Injectable()
export class PriceWaybillUseCase {
  private readonly logger = new Logger(PriceWaybillUseCase.name);

  constructor(
    @Inject(WAYBILL_REPOSITORY) private readonly waybills: WaybillRepository,
    @Inject(PRICING_RULE_REPOSITORY) private readonly rules: PricingRuleRepository,
  ) {}

  async execute(waybill: Waybill): Promise<Waybill> {
    if (waybill.status !== "extracted") return waybill;

    const rules = await this.rules.findActive(waybill.tenantId);
    const match = findBestPricingRule(rules, {
      destination: waybill.destination,
      origin: waybill.origin,
      customerName: waybill.customerName,
      // The waybill records the vehicle's registration, not its type. Matching
      // a rule that names a vehicle type needs the type, which is not read off
      // the page, so a type-specific rule only applies once someone supplies it.
      vehicleType: null,
      weight: waybill.weight,
      waybillDate: waybill.waybillDate,
    });

    if (!match) {
      this.logger.log(`waybill_unpriced:${waybill.tenantId}:${waybill.id}`);
      return waybill;
    }

    const priced = waybill.applyPrice({
      priceKobo: match.priceKobo,
      pricingRuleId: match.rule.id,
    });
    await this.waybills.save(priced);
    return priced;
  }
}
