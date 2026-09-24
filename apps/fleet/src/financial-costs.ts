import type { FleetFinancialConfigRecord } from "./contexts/fleet/shared/infrastructure/persistence/fleet-orm";

type CostConfig = Partial<
  Pick<
    FleetFinancialConfigRecord,
    | "monthlyWagesNgn"
    | "monthlyDriverWageNgn"
    | "monthlyDepreciationNgn"
    | "assetPurchasePriceNgn"
    | "assetPurchaseDate"
    | "assetUsefulLifeMonths"
    | "assetSalvageValueNgn"
    | "depreciationMethod"
  >
> | null | undefined;

/**
 * The Configure Costs form saves the driver wage as monthlyDriverWageNgn. It is
 * a monthly figure whatever the allocation method, so it stands in when the
 * older monthlyWagesNgn is not set.
 */
export function monthlyWages(cfg: CostConfig): number {
  return cfg?.monthlyWagesNgn ?? cfg?.monthlyDriverWageNgn ?? 0;
}

/** A set monthlyDepreciationNgn wins; otherwise depreciation comes from the asset fields. */
export function monthlyDepreciation(cfg: CostConfig, now: Date): number {
  if (cfg?.monthlyDepreciationNgn != null) return cfg.monthlyDepreciationNgn;
  const price = cfg?.assetPurchasePriceNgn ?? 0;
  const life = cfg?.assetUsefulLifeMonths ?? 0;
  if (price <= 0 || life <= 0) return 0;

  const salvage = Math.min(cfg?.assetSalvageValueNgn ?? 0, price);
  const age = monthsSince(cfg?.assetPurchaseDate ?? null, now);
  if (cfg?.depreciationMethod === "declining_balance") return decliningBalance(price, salvage, life, age);
  return age >= life ? 0 : (price - salvage) / life;
}

// Double-declining balance: a fixed share of the remaining book value each
// month, never taking the book value below salvage.
function decliningBalance(price: number, salvage: number, life: number, age: number): number {
  const rate = Math.min(1, 2 / life);
  const book = price * Math.pow(1 - rate, age);
  return Math.max(0, Math.min(book * rate, book - salvage));
}

function monthsSince(iso: string | null, now: Date): number {
  const start = iso ? new Date(iso) : null;
  if (!start || Number.isNaN(start.getTime())) return 0;
  const months = (now.getUTCFullYear() - start.getUTCFullYear()) * 12 + (now.getUTCMonth() - start.getUTCMonth());
  return Math.max(0, months);
}
