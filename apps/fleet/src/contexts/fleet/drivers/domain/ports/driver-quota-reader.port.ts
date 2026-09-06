export interface DriverQuotaReader {
  /**
   * Driver allowance for a tenant's current plan.
   * `null` means unlimited, which is a distinct value from zero.
   */
  findDriverLimit(tenantId: string): Promise<number | null>;
}

export const DRIVER_QUOTA_READER = Symbol("DRIVER_QUOTA_READER");
