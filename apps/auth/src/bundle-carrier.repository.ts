export type StoredBundleCarrier = {
  id: string;
  name: string;
  displayName: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export interface BundleCarrierRepository {
  findAll(activeOnly?: boolean): Promise<StoredBundleCarrier[]>;
  findById(id: string): Promise<StoredBundleCarrier | null>;
  save(carrier: StoredBundleCarrier): Promise<void>;
  delete(id: string): Promise<void>;
}

export const BUNDLE_CARRIER_REPOSITORY = Symbol('BUNDLE_CARRIER_REPOSITORY');
