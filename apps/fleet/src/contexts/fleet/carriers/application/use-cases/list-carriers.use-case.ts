import { Inject, Injectable } from "@nestjs/common";
import { BUNDLE_CATALOG_READER, type BundleCatalogReader } from "../../domain/ports/bundle-catalog-reader.port";
import { readBundleCatalog } from "../read-bundle-catalog";

@Injectable()
export class ListCarriersUseCase {
  constructor(@Inject(BUNDLE_CATALOG_READER) private readonly reader: BundleCatalogReader) {}

  async execute() {
    return (await readBundleCatalog(this.reader)).carriers;
  }
}
