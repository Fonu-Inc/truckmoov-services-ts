import { FleetRuleError } from "../../../shared/domain/errors/fleet-rule.error";

export const PRICING_MODES = ["flat", "per_unit"] as const;

export type PricingMode = (typeof PRICING_MODES)[number];

export function isPricingMode(value: string): value is PricingMode {
  return PRICING_MODES.includes(value as PricingMode);
}

export type PricingRuleProps = {
  id: string;
  tenantId: string;
  name: string;
  /** Empty means the rule matches any origin. */
  origin: string | null;
  destination: string;
  /**
   * Other spellings of the same destination. They exist because waybills are
   * handwritten: "FCT" and "Abuja Central" are the same place to a driver.
   */
  destinationAliases: string[];
  mode: PricingMode;
  /** Stored even though only NGN is offered, so a second currency is never implied. */
  currency: string;
  flatPriceKobo: number | null;
  pricePerUnitKobo: number | null;
  unitType: string | null;
  /** Floor under a per-unit calculation. */
  minimumChargeKobo: number | null;
  /** Empty means any vehicle type. */
  vehicleType: string | null;
  /** Empty means every customer. */
  customerName: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export class PricingRule {
  private constructor(private readonly props: PricingRuleProps) {}

  static create(props: PricingRuleProps): PricingRule {
    if (!props.id.trim()) throw new FleetRuleError("id is required");
    if (!props.tenantId.trim()) throw new FleetRuleError("tenantId is required");
    if (!props.name.trim()) throw new FleetRuleError("a rule name is required");
    if (!props.destination.trim()) throw new FleetRuleError("a destination is required");
    if (!isPricingMode(props.mode)) {
      throw new FleetRuleError(`mode must be one of: ${PRICING_MODES.join(", ")}`);
    }
    if (props.mode === "flat" && !isPositiveAmount(props.flatPriceKobo)) {
      throw new FleetRuleError("a flat-rate rule needs a flat price");
    }
    if (props.mode === "per_unit" && !isPositiveAmount(props.pricePerUnitKobo)) {
      throw new FleetRuleError("a per-unit rule needs a price per unit");
    }
    if (props.mode === "per_unit" && !props.unitType?.trim()) {
      // A price per unit with no unit is unusable: 28,333 per what?
      throw new FleetRuleError("a per-unit rule needs a unit type");
    }
    assertValidWindow(props.effectiveFrom, props.effectiveTo);

    const now = new Date().toISOString();
    return new PricingRule({
      ...props,
      id: props.id.trim(),
      tenantId: props.tenantId.trim(),
      name: props.name.trim(),
      origin: props.origin?.trim() || null,
      destination: props.destination.trim(),
      destinationAliases: (props.destinationAliases ?? [])
        .map((alias) => alias.trim())
        .filter(Boolean),
      currency: props.currency?.trim() || "NGN",
      unitType: props.unitType?.trim() || null,
      vehicleType: props.vehicleType?.trim() || null,
      customerName: props.customerName?.trim() || null,
      createdAt: props.createdAt ?? now,
      updatedAt: props.updatedAt ?? now,
    });
  }

  get id() { return this.props.id; }
  get tenantId() { return this.props.tenantId; }
  get name() { return this.props.name; }
  get origin() { return this.props.origin; }
  get destination() { return this.props.destination; }
  get destinationAliases() { return this.props.destinationAliases; }
  get mode() { return this.props.mode; }
  get currency() { return this.props.currency; }
  get flatPriceKobo() { return this.props.flatPriceKobo; }
  get pricePerUnitKobo() { return this.props.pricePerUnitKobo; }
  get unitType() { return this.props.unitType; }
  get minimumChargeKobo() { return this.props.minimumChargeKobo; }
  get vehicleType() { return this.props.vehicleType; }
  get customerName() { return this.props.customerName; }
  get effectiveFrom() { return this.props.effectiveFrom; }
  get effectiveTo() { return this.props.effectiveTo; }
  get active() { return this.props.active; }
  get createdAt() { return this.props.createdAt ?? new Date().toISOString(); }
  get updatedAt() { return this.props.updatedAt ?? this.createdAt; }

  /**
   * Whether the rule was in force on a given date.
   *
   * Judged against the date on the waybill, never today. A trip made in March
   * prices against the rule that applied in March, even if that rule has since
   * expired — otherwise re-pricing an old waybill silently changes what a
   * customer was told they owed.
   */
  wasEffectiveOn(date: string): boolean {
    const on = Date.parse(date);
    if (Number.isNaN(on)) return false;
    if (this.effectiveFrom && Date.parse(this.effectiveFrom) > on) return false;
    if (this.effectiveTo && Date.parse(this.effectiveTo) < on) return false;
    return true;
  }

  matchesDestination(destination: string): boolean {
    const wanted = normalizePlace(destination);
    if (!wanted) return false;
    return [this.destination, ...this.destinationAliases].some(
      (candidate) => normalizePlace(candidate) === wanted,
    );
  }

  /**
   * How specific this rule is. A rule naming a customer beats an any-customer
   * rule for the same route, and the order has to be decided here rather than
   * left to whichever row the database returned first.
   */
  get specificity(): number {
    return (
      (this.customerName ? 4 : 0) + (this.origin ? 2 : 0) + (this.vehicleType ? 1 : 0)
    );
  }

  /** The price this rule puts on a load, in kobo. */
  priceFor(weight: number | null): number | null {
    if (this.mode === "flat") return this.flatPriceKobo;
    if (weight === null || weight <= 0) return null;

    const calculated = Math.round((this.pricePerUnitKobo ?? 0) * weight);
    return Math.max(calculated, this.minimumChargeKobo ?? 0);
  }

  deactivate(): PricingRule {
    return PricingRule.create({
      ...this.props,
      active: false,
      updatedAt: new Date().toISOString(),
    });
  }

  toPrimitives(): PricingRuleProps {
    return { ...this.props };
  }
}

function isPositiveAmount(value: number | null): boolean {
  return value !== null && Number.isInteger(value) && value > 0;
}

function assertValidWindow(from: string | null, to: string | null): void {
  if (from && Number.isNaN(Date.parse(from))) {
    throw new FleetRuleError("effectiveFrom must be a valid ISO date");
  }
  if (to && Number.isNaN(Date.parse(to))) {
    throw new FleetRuleError("effectiveTo must be a valid ISO date");
  }
  if (from && to && Date.parse(from) > Date.parse(to)) {
    throw new FleetRuleError("effectiveFrom cannot be after effectiveTo");
  }
}

/**
 * Case- and whitespace-insensitive, because the destination was written by hand
 * and then read by a machine. "  lagos " and "Lagos" are the same place.
 */
export function normalizePlace(value: string | null): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}
