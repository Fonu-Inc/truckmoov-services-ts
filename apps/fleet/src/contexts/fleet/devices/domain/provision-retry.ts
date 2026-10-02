import type { Device } from "./entities/device.entity";

export const MAX_PROVISION_ATTEMPTS = 8;
const BASE_DELAY_MS = 60_000;
const MAX_DELAY_MS = 6 * 60 * 60 * 1000;
const MAX_ERROR_LENGTH = 255;

export function provisionRetryDelayMs(attempts: number): number {
  return Math.min(BASE_DELAY_MS * 2 ** Math.max(attempts - 1, 0), MAX_DELAY_MS);
}

/** Null once the attempts are used up: the device stays failed and a person has to look. */
export function nextProvisionAttemptAt(attempts: number, now: Date): string | null {
  if (attempts >= MAX_PROVISION_ATTEMPTS) return null;
  return new Date(now.getTime() + provisionRetryDelayMs(attempts)).toISOString();
}

export function describeProvisionError(error: unknown): string {
  const message = error instanceof Error ? error.message : "unknown error";
  return message.slice(0, MAX_ERROR_LENGTH);
}

export function withFailedProvisioning(device: Device, error: unknown, now: Date): Device {
  const attempts = device.provisionAttempts + 1;
  return device.withProvisioning({
    provisionStatus: "failed",
    provisionAttempts: attempts,
    provisionNextAttemptAt: nextProvisionAttemptAt(attempts, now),
    provisionError: describeProvisionError(error),
  });
}

export function withRegisteredProvisioning(device: Device, traccarDeviceId: string): Device {
  return device.withProvisioning({
    traccarDeviceId,
    provisionStatus: "registered",
    provisionNextAttemptAt: null,
    provisionError: null,
  });
}
