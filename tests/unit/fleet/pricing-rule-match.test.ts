import { describe, expect, it } from "vitest";
import { PricingRule } from "../../../apps/fleet/src/contexts/fleet/waybills/domain/entities/pricing-rule.entity";
import {
  findBestPricingRule,
  type PriceableWaybill,
} from "../../../apps/fleet/src/contexts/fleet/waybills/domain/entities/pricing-rule-match";

const TENANT = "tenant-1";
const NAIRA = 100;

function rule(overrides: Partial<Parameters<typeof PricingRule.create>[0]> = {}) {
  return PricingRule.create({
    id: "rule-1",
    tenantId: TENANT,
    name: "Lagos to Abuja",
    origin: null,
    destination: "Abuja",
    destinationAliases: [],
    mode: "flat",
    currency: "NGN",
    flatPriceKobo: 500_000 * NAIRA,
    pricePerUnitKobo: null,
    unitType: null,
    minimumChargeKobo: null,
    vehicleType: null,
    customerName: null,
    effectiveFrom: null,
    effectiveTo: null,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });
}

function waybill(overrides: Partial<PriceableWaybill> = {}): PriceableWaybill {
  return {
    destination: "Abuja",
    origin: "Lagos",
    customerName: "Dangote",
    vehicleType: "30-ton trailer",
    weight: 30,
    waybillDate: "2026-02-24",
    ...overrides,
  };
}

describe("Pricing rule matching", () => {
  it("prices a flat-rate rule", () => {
    const match = findBestPricingRule([rule()], waybill());

    expect(match?.priceKobo).toBe(500_000 * NAIRA);
  });

  it("prices per unit against the weight", () => {
    const perUnit = rule({
      mode: "per_unit",
      flatPriceKobo: null,
      pricePerUnitKobo: 28_333 * NAIRA,
      unitType: "ton",
    });

    const match = findBestPricingRule([perUnit], waybill({ weight: 30 }));

    expect(match?.priceKobo).toBe(28_333 * NAIRA * 30);
  });

  it("applies the minimum charge as a floor", () => {
    const perUnit = rule({
      mode: "per_unit",
      flatPriceKobo: null,
      pricePerUnitKobo: 10_000 * NAIRA,
      unitType: "ton",
      minimumChargeKobo: 250_000 * NAIRA,
    });

    // 2 tons at 10,000 is 20,000, well under the floor.
    const match = findBestPricingRule([perUnit], waybill({ weight: 2 }));

    expect(match?.priceKobo).toBe(250_000 * NAIRA);
  });

  it("prefers a customer rule over an any-customer rule for the same route", () => {
    const anyCustomer = rule({ id: "any", flatPriceKobo: 500_000 * NAIRA });
    const dangote = rule({
      id: "dangote",
      customerName: "Dangote",
      flatPriceKobo: 450_000 * NAIRA,
    });

    // Order reversed on purpose: the answer must not depend on which row came
    // back first.
    const match = findBestPricingRule([anyCustomer, dangote], waybill());

    expect(match?.rule.id).toBe("dangote");
    expect(match?.priceKobo).toBe(450_000 * NAIRA);
  });

  it("prefers a rule naming an origin over one that matches any origin", () => {
    const anyOrigin = rule({ id: "any-origin" });
    const fromLagos = rule({ id: "from-lagos", origin: "Lagos" });

    expect(findBestPricingRule([anyOrigin, fromLagos], waybill())?.rule.id).toBe(
      "from-lagos",
    );
  });

  it("breaks a specificity tie on the most recently effective rule", () => {
    const older = rule({ id: "older", effectiveFrom: "2026-01-01", flatPriceKobo: 400_000 * NAIRA });
    const newer = rule({ id: "newer", effectiveFrom: "2026-02-01", flatPriceKobo: 480_000 * NAIRA });

    expect(findBestPricingRule([older, newer], waybill())?.rule.id).toBe("newer");
  });

  it("prices against the rule in force on the waybill's date, not today", () => {
    const expired = rule({
      id: "march-rate",
      effectiveFrom: "2026-01-01",
      effectiveTo: "2026-03-31",
      flatPriceKobo: 400_000 * NAIRA,
    });
    const current = rule({
      id: "april-rate",
      effectiveFrom: "2026-04-01",
      flatPriceKobo: 600_000 * NAIRA,
    });

    // A trip made in March prices at the March rate however long ago that was.
    const match = findBestPricingRule([expired, current], waybill({ waybillDate: "2026-03-15" }));

    expect(match?.rule.id).toBe("march-rate");
    expect(match?.priceKobo).toBe(400_000 * NAIRA);
  });

  it("matches a destination alias, ignoring case and spacing", () => {
    const withAliases = rule({
      destination: "Abuja",
      destinationAliases: ["FCT", "Abuja Central"],
    });

    for (const destination of ["fct", "  ABUJA   CENTRAL ", "Abuja"]) {
      expect(findBestPricingRule([withAliases], waybill({ destination }))).not.toBeNull();
    }
  });

  it("ignores an inactive rule", () => {
    expect(findBestPricingRule([rule().deactivate()], waybill())).toBeNull();
  });

  it("does not price a waybill with no date", () => {
    // Without a date there is no way to know which rule was in force.
    expect(findBestPricingRule([rule()], waybill({ waybillDate: null }))).toBeNull();
  });

  it("does not price a waybill with no destination", () => {
    expect(findBestPricingRule([rule()], waybill({ destination: null }))).toBeNull();
  });

  it("falls through to a flat rule when the weight needed for per-unit is missing", () => {
    const perUnit = rule({
      id: "per-unit",
      customerName: "Dangote",
      mode: "per_unit",
      flatPriceKobo: null,
      pricePerUnitKobo: 28_333 * NAIRA,
      unitType: "ton",
    });
    const flat = rule({ id: "flat", flatPriceKobo: 500_000 * NAIRA });

    // The per-unit rule is more specific, but it cannot price a load whose
    // weight was never read. The fallback still can.
    const match = findBestPricingRule([perUnit, flat], waybill({ weight: null }));

    expect(match?.rule.id).toBe("flat");
  });

  it("returns nothing when no rule covers the route", () => {
    expect(findBestPricingRule([rule()], waybill({ destination: "Kano" }))).toBeNull();
  });

  it("does not match a rule for a different customer", () => {
    const otherCustomer = rule({ customerName: "BUA" });

    expect(findBestPricingRule([otherCustomer], waybill({ customerName: "Dangote" }))).toBeNull();
  });
});
