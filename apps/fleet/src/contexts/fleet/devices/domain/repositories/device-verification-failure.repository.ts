export type DeviceVerificationFailure = {
  id: string;
  tenantId: string;
  deviceId: string;
  imei: string;
  reason: string;
  detail: string | null;
  /**
   * Exactly what the device sent, as bytes we did not try to read. A device
   * that is misconfigured produces payloads no parser accepts, and throwing
   * them away removes the only evidence of what it is doing wrong.
   */
  rawPayload: string | null;
  sourceAddress: string | null;
  createdAt: string;
};

export interface DeviceVerificationFailureRepository {
  append(failure: DeviceVerificationFailure): Promise<void>;
  findByDevice(
    deviceId: string,
    tenantId: string,
    limit: number,
  ): Promise<DeviceVerificationFailure[]>;
}

export const DEVICE_VERIFICATION_FAILURE_REPOSITORY = Symbol(
  "DEVICE_VERIFICATION_FAILURE_REPOSITORY",
);
