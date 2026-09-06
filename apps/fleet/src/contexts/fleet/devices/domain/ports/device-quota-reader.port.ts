export interface DeviceQuotaReader {
  /**
   * Device allowance for a tenant's current plan.
   * `null` means unlimited, which is a distinct value from zero.
   */
  findDeviceLimit(tenantId: string): Promise<number | null>;
}

export const DEVICE_QUOTA_READER = Symbol("DEVICE_QUOTA_READER");
