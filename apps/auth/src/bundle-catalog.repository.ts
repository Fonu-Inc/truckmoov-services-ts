export type StoredBundleCatalog = {
  id: string;
  code: string;
  name: string;
  carrierId: string;
  dataAmountGb: number;
  validityDays: number;
  billingCycle: string;
  priceKobo: number;
  currency: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type BundleCatalogFilters = {
  carrierId?: string;
  billingCycle?: string;
  search?: string;
  activeOnly?: boolean;
  page?: number;
  limit?: number;
};

export interface BundleCatalogRepository {
  findAll(filters?: BundleCatalogFilters): Promise<{ items: StoredBundleCatalog[]; total: number }>;
  findById(id: string): Promise<StoredBundleCatalog | null>;
  save(bundle: StoredBundleCatalog): Promise<void>;
  delete(id: string): Promise<void>;
}

export const BUNDLE_CATALOG_REPOSITORY = Symbol('BUNDLE_CATALOG_REPOSITORY');
