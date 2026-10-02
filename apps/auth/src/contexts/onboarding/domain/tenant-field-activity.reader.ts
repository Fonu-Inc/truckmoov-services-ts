export type FieldActivityEvent = {
  id: string;
  occurredAt: Date;
  event: 'SIMs Added' | 'Installation Completed' | 'Vehicles Added' | 'Devices Added' | 'Service Removed';
  resource: string;
};

export type TenantUsageCounts = { vehicles: number; drivers: number; devices: number; sims: number };

export interface TenantFieldActivityReader {
  list(tenantId: string, limit: number): Promise<FieldActivityEvent[]>;
  usageCounts(tenantId: string): Promise<TenantUsageCounts | null>;
}

export const TENANT_FIELD_ACTIVITY_READER = Symbol('TENANT_FIELD_ACTIVITY_READER');
