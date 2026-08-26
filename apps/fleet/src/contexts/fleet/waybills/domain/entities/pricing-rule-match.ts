import { PricingRule, normalizePlace } from "./pricing-rule.entity";

export type PriceableWaybill = {
  destination: string | null;
  origin: string | null;
  customerName: string | null;
  vehicleType: string | null;
  weight: number | null;
  /** The date on the document. Rules are judged against this, not against today. */
  waybillDate: string | null;
};

export type PricingMatch = {
  rule: PricingRule;
  priceKobo: number;
};

/**
 * Picks the one rule that prices a waybill.
 *
 * Several rules can match the same load — a customer-specific Lagos to Abuja
 * rule and an any-customer fallback for the same route. Choosing between them
 * has to happen here, in one place, or the same waybill prices differently
 * depending on which row came back first.
 *
 * Order: most specific wins, then the most recently effective of those.
 */
export function findBestPricingRule(
  rules: PricingRule[],
  waybill: PriceableWaybill,
): PricingMatch | null {
  if (!waybill.destination || !waybill.waybillDate) return null;

  const candidates = rules
    .filter((rule) => applies(rule, waybill))
    .sort(byMostSpecificThenNewest);

  for (const rule of candidates) {
    const priceKobo = rule.priceFor(waybill.weight);
    // A per-unit rule cannot price a load whose weight was never read. The next
    // candidate — often a flat-rate fallback — still can.
    if (priceKobo !== null && priceKobo > 0) {
      return { rule, priceKobo };
    }
  }

  return null;
}

function applies(rule: PricingRule, waybill: PriceableWaybill): boolean {
  if (!rule.active) return false;
  if (!rule.matchesDestination(waybill.destination ?? "")) return false;
  if (!rule.wasEffectiveOn(waybill.waybillDate ?? "")) return false;
  // A rule that leaves a field empty applies to every value of it.
  if (rule.origin && normalizePlace(rule.origin) !== normalizePlace(waybill.origin)) {
    return false;
  }
  if (
    rule.customerName
    && normalizePlace(rule.customerName) !== normalizePlace(waybill.customerName)
  ) {
    return false;
  }
  if (
    rule.vehicleType
    && normalizePlace(rule.vehicleType) !== normalizePlace(waybill.vehicleType)
  ) {
    return false;
  }
  return true;
}

function byMostSpecificThenNewest(left: PricingRule, right: PricingRule): number {
  if (left.specificity !== right.specificity) {
    return right.specificity - left.specificity;
  }

  const leftFrom = left.effectiveFrom ? Date.parse(left.effectiveFrom) : 0;
  const rightFrom = right.effectiveFrom ? Date.parse(right.effectiveFrom) : 0;
  if (leftFrom !== rightFrom) return rightFrom - leftFrom;

  // Last resort, so the order is total and two equal rules never swap between
  // reads.
  return right.createdAt.localeCompare(left.createdAt);
}
