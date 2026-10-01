import type { BundleCatalog } from "../entities/carrier.entity";

export interface BundleCatalogReader {
  /** The active catalogue, as auth holds it. Null when auth cannot be asked. */
  read(): Promise<BundleCatalog | null>;
}

export const BUNDLE_CATALOG_READER = Symbol("BUNDLE_CATALOG_READER");
