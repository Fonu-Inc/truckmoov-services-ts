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
  /** "expiring" is active and ending within 7 days; "expired" includes active rows past their expiry. */
  status?: string;
  billingCycles?: string[];
  page?: number;
  limit?: number;
};

export const EXPIRING_WITHIN_DAYS = 7;

/** What an allocation is right now: an active one past its expiry has expired even before the sweep runs. */
export function effectiveAllocationStatus(a: Pick<StoredBundleAllocation, 'status' | 'expiresAt'>, now = new Date()): string {
  return a.status === 'active' && a.expiresAt && a.expiresAt < now ? 'expired' : a.status;
}

export interface BundleAllocationRepository {
  /** Cancelled (refunded) allocations are left out unless asked for by status. */
  findAll(filters?: BundleAllocationFilters): Promise<{ items: StoredBundleAllocation[]; total: number }>;
  findById(id: string): Promise<StoredBundleAllocation | null>;
  findByPaymentReference(tenantId: string, paymentReference: string): Promise<StoredBundleAllocation[]>;
  save(allocation: StoredBundleAllocation): Promise<void>;
  /** Counts by effective status (see effectiveAllocationStatus). */
  countByStatus(tenantId: string): Promise<Record<string, number>>;
  findExpiringWithin(tenantId: string, days: number): Promise<StoredBundleAllocation[]>;
  /** Not cancelled; allocations live at any point in the window, when one is given. */
  sumDataUsedByBundle(
    tenantId: string,
    window?: { start: Date; end: Date },
  ): Promise<Array<{ bundleId: string; usedMb: number; totalMb: number }>>;
  /** Moves every active allocation whose expiry has passed to expired; answers how many moved. */
  expireDue(now: Date): Promise<number>;
}

export const BUNDLE_ALLOCATION_REPOSITORY = Symbol('BUNDLE_ALLOCATION_REPOSITORY');
