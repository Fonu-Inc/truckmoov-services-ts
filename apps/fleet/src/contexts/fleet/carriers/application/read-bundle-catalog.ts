import { ServiceUnavailableException } from "@nestjs/common";
import type { BundleCatalog } from "../domain/entities/carrier.entity";
import type { BundleCatalogReader } from "../domain/ports/bundle-catalog-reader.port";

/** No local fallback: an old copy would quote prices the wallet will not charge. */
export async function readBundleCatalog(reader: BundleCatalogReader): Promise<BundleCatalog> {
  const catalog = await reader.read();
  if (!catalog) throw new ServiceUnavailableException("Carrier catalog cannot be read right now");
  return catalog;
}
