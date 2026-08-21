export interface VehicleQuotaReader {
  /**
   * Active-vehicle allowance for a tenant's current plan.
   * `null` means unlimited, which is a distinct value from zero.
   */
  findActiveVehicleLimit(tenantId: string): Promise<number | null>;
}

export const VEHICLE_QUOTA_READER = Symbol("VEHICLE_QUOTA_READER");
