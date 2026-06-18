export type StoredBundleAllocation = {
  id: string;
  tenantId: string;
  mobileNumber: string;
  bundleId: string;
  dataUsedMb: number;
  dataTotalMb: number;
  activatedAt: Date | null;
  expiresAt: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

export type BundleAllocationFilters = {
  tenantId?: string;
  search?: string;
  status?: string;
  billingCycles?: string[];
  page?: number;
  limit?: number;
};

export interface BundleAllocationRepository {
  findAll(filters?: BundleAllocationFilters): Promise<{ items: StoredBundleAllocation[]; total: number }>;
  findById(id: string): Promise<StoredBundleAllocation | null>;
  save(allocation: StoredBundleAllocation): Promise<void>;
  countByStatus(tenantId: string): Promise<Record<string, number>>;
  findExpiringWithin(tenantId: string, days: number): Promise<StoredBundleAllocation[]>;
  sumDataUsedByBundle(tenantId: string): Promise<Array<{ bundleId: string; usedMb: number; totalMb: number }>>;
}

export const BUNDLE_ALLOCATION_REPOSITORY = Symbol('BUNDLE_ALLOCATION_REPOSITORY');
