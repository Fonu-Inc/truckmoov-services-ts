export type DeviceIdentityAction =
  | "registered"
  | "updated"
  | "assigned"
  | "unassigned"
  | "decommissioned"
  | "deleted";

/**
 * Emitted whenever a device's IMEI ↔ vehicle/tenant identity changes. The Go
 * tracking service caches this to rekey incoming telemetry off the canonical
 * vehicle UUID instead of stuffing the IMEI into both vehicle_id and device_id.
 */
export type DeviceIdentityChangedEvent = {
  tenant_id: string;
  device_id: string;
  imei: string;
  manufacturer: string;
  model: string;
  vehicle_id: string | null;
  action: DeviceIdentityAction;
  /** Held by the tenant's suspension. Tracking drops data for a held device. */
  suspended?: boolean;
  suspension_cause?: "non_payment" | "tenant_manual" | null;
};

export interface DeviceIdentityEventPublisher {
  publish(event: DeviceIdentityChangedEvent): Promise<void>;
}

export const DEVICE_IDENTITY_EVENT_PUBLISHER = Symbol("DEVICE_IDENTITY_EVENT_PUBLISHER");
