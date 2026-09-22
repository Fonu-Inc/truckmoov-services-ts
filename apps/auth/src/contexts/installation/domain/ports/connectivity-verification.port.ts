export type DeviceConnectivity = {
  deviceId: string;
  imei: string;
  manufacturer: string;
  model: string;
  assignedVehicleId: string | null;
  reporting: boolean;
  lastSeen: string | null;
  verificationStatus: string | null;
};

export type TenantConnectivity = {
  total: number;
  reporting: number;
  devices: DeviceConnectivity[];
};

/**
 * Whether the devices fitted for a tenant are actually talking to us.
 *
 * Asked of the fleet service, which owns the telemetry, rather than inferred
 * here. An answer of null means the question could not be asked at all, which
 * is not the same as every device being silent.
 */
export interface ConnectivityVerification {
  forTenant(tenantId: string): Promise<TenantConnectivity | null>;
}

export const CONNECTIVITY_VERIFICATION = Symbol('CONNECTIVITY_VERIFICATION');
