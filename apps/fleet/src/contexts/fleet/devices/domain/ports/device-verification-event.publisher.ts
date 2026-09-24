import type { Device } from "../entities/device.entity";

export type VerificationFailureNotice = { code: string; message: string };

/** Announces the outcome of a device's verification window. Never fails the caller. */
export interface DeviceVerificationEventPublisher {
  verified(device: Device, at: string): Promise<void>;
  failed(device: Device, failure: VerificationFailureNotice, at: string): Promise<void>;
}

export const DEVICE_VERIFICATION_EVENT_PUBLISHER = Symbol("DEVICE_VERIFICATION_EVENT_PUBLISHER");
