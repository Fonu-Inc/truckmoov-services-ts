/** Which service put the bytes there. Each owns and can recompute its own row. */
export const STORAGE_SOURCES = ['fleet_documents', 'kyc', 'media', 'mailbox', 'support_tickets'] as const;
export type StorageSource = (typeof STORAGE_SOURCES)[number];

export type StorageUsage = {
  tenantId: string;
  source: StorageSource;
  bytesUsed: number;
};

export interface StorageUsageRepository {
  /**
   * Moves a source's total by a signed amount. Negative on delete.
   *
   * Must be a single atomic statement. Reading the total and writing it back
   * would lose concurrent uploads, and a lost increment means a tenant quietly
   * exceeding their plan.
   */
  addBytes(tenantId: string, source: StorageSource, deltaBytes: number): Promise<void>;

  /** Replaces a source's total outright, for reconciliation. */
  setBytes(tenantId: string, source: StorageSource, bytesUsed: number): Promise<void>;

  /** Every source added together, which is what the quota is measured against. */
  totalBytes(tenantId: string): Promise<number>;

  breakdown(tenantId: string): Promise<StorageUsage[]>;
}

export const STORAGE_USAGE_REPOSITORY = Symbol('STORAGE_USAGE_REPOSITORY');

export const BYTES_PER_GB = 1024 * 1024 * 1024;

export class StorageQuotaExceededError extends Error {
  constructor(limitGb: number, usedBytes: number) {
    super(
      `This plan includes ${limitGb} GB of storage, and ${(usedBytes / BYTES_PER_GB).toFixed(2)} GB is in use`,
    );
  }
}
