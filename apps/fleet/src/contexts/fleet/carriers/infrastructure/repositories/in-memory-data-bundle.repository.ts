import { Injectable } from "@nestjs/common";
import type { DataBundle } from "../../domain/entities/carrier.entity";
import type { DataBundleFilters, DataBundleRepository } from "../../domain/repositories/data-bundle.repository";
import { SEED_DATA_BUNDLES } from "./seed-catalog";

@Injectable()
export class InMemoryDataBundleRepository implements DataBundleRepository {
  async findAll(filters?: DataBundleFilters): Promise<DataBundle[]> {
    if (!filters?.carrierId) return SEED_DATA_BUNDLES;
    return SEED_DATA_BUNDLES.filter((b) => b.carrierId === filters.carrierId);
  }
}
