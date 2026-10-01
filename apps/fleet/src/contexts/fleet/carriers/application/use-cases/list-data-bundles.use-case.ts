import { Inject, Injectable } from "@nestjs/common";
import { BUNDLE_CATALOG_READER, type BundleCatalogReader } from "../../domain/ports/bundle-catalog-reader.port";
import { readBundleCatalog } from "../read-bundle-catalog";

export type DataBundleFilters = {
  carrierId?: string;
};

@Injectable()
export class ListDataBundlesUseCase {
  constructor(@Inject(BUNDLE_CATALOG_READER) private readonly reader: BundleCatalogReader) {}

  async execute(filters?: DataBundleFilters) {
    const { bundles } = await readBundleCatalog(this.reader);
    return filters?.carrierId ? bundles.filter((b) => b.carrierId === filters.carrierId) : bundles;
  }
}
