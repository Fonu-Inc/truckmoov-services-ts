export type FleetHoldCause = "non_payment" | "tenant_manual";

export type HeldDevice = {
  id: string;
  tenantId: string;
  imei: string;
  manufacturer: string;
  model: string;
  vehicleId: string | null;
  /** The cause after the change; null once released. */
  cause: FleetHoldCause | null;
};

export type HoldCounts = { devices: number; vehicles: number; shareLinks: number };

export type DeviceChunkHandler = (devices: HeldDevice[]) => Promise<void>;

/**
 * Non-destructive holds on a tenant's devices, vehicles and share links.
 * A hold only takes unheld assets and a release only gives back the named
 * causes, so repeating either is harmless.
 */
export interface TenantHoldRepository {
  hold(tenantId: string, cause: FleetHoldCause, reason: string, onDevices: DeviceChunkHandler): Promise<HoldCounts>;
  release(tenantId: string, causes: FleetHoldCause[], onDevices: DeviceChunkHandler): Promise<HoldCounts>;
  retag(tenantId: string, from: FleetHoldCause, to: FleetHoldCause, onDevices: DeviceChunkHandler): Promise<void>;
  preview(tenantIds: string[]): Promise<Array<{ tenantId: string } & HoldCounts>>;
  listHeldDevices(limit: number, afterId: string | null): Promise<HeldDevice[]>;
}

export const TENANT_HOLD_REPOSITORY = Symbol("TENANT_HOLD_REPOSITORY");

export const HOLD_CHUNK_SIZE = 5000;
