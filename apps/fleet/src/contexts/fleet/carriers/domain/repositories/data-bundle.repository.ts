import type { DataBundle } from "../entities/carrier.entity";

export type DataBundleFilters = {
  carrierId?: string;
};

export interface DataBundleRepository {
  findAll(filters?: DataBundleFilters): Promise<DataBundle[]>;
}

export const DATA_BUNDLE_REPOSITORY = Symbol("DATA_BUNDLE_REPOSITORY");
