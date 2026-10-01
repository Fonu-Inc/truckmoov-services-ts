import type { BundleCatalog } from "./entities/carrier.entity";

export type SimSelection = {
  carrierId?: string | null;
  bundleId?: string | null;
};

/** Why a carrier/bundle pick is not one auth sells, or null when it is. */
export function simSelectionProblem(catalog: BundleCatalog, { carrierId, bundleId }: SimSelection): string | null {
  if (carrierId && !catalog.carriers.some((c) => c.id === carrierId)) {
    return "carrierId is not in the carrier catalog";
  }
  if (!bundleId) return null;
  const bundle = catalog.bundles.find((b) => b.id === bundleId);
  if (!bundle) return "bundleId is not in the data bundle catalog";
  if (carrierId && bundle.carrierId !== carrierId) return "bundleId does not belong to carrierId";
  return null;
}
