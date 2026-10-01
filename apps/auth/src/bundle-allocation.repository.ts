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
  paymentReference?: string | null;
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
  findByPaymentReference(tenantId: string, paymentReference: string): Promise<StoredBundleAllocation[]>;
  save(allocation: StoredBundleAllocation): Promise<void>;
  countByStatus(tenantId: string): Promise<Record<string, number>>;
  findExpiringWithin(tenantId: string, days: number): Promise<StoredBundleAllocation[]>;
  /** Allocations live at any point in the window, when one is given. */
  sumDataUsedByBundle(
    tenantId: string,
    window?: { start: Date; end: Date },
  ): Promise<Array<{ bundleId: string; usedMb: number; totalMb: number }>>;
}

export const BUNDLE_ALLOCATION_REPOSITORY = Symbol('BUNDLE_ALLOCATION_REPOSITORY');
