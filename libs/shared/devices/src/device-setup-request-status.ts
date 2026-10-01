/**
 * A tenant's request for devices, from submission to installed hardware. Fleet
 * stores it and the platform queue in auth works it, so both read one lifecycle.
 */
export const DEVICE_SETUP_REQUEST_STATUSES = [
  "under_review",
  "awaiting_payment",
  "ready_for_installation",
  "installation_in_progress",
  "completed",
  "rejected",
  "cancelled",
] as const;

export type DeviceSetupRequestStatus = (typeof DEVICE_SETUP_REQUEST_STATUSES)[number];

export const DEVICE_SETUP_REQUEST_TRANSITIONS: Record<
  DeviceSetupRequestStatus,
  readonly DeviceSetupRequestStatus[]
> = {
  under_review: ["awaiting_payment", "rejected", "cancelled"],
  awaiting_payment: ["ready_for_installation", "cancelled"],
  ready_for_installation: ["installation_in_progress", "cancelled"],
  installation_in_progress: ["completed", "cancelled"],
  completed: [],
  rejected: [],
  cancelled: [],
};

/** Requests waiting on a platform decision. */
export const SETUP_REQUEST_PENDING_STATUSES: readonly DeviceSetupRequestStatus[] = ["under_review"];

/** Requests the platform has said yes to, wherever fulfilment has reached. */
export const SETUP_REQUEST_APPROVED_STATUSES: readonly DeviceSetupRequestStatus[] = [
  "awaiting_payment",
  "ready_for_installation",
  "installation_in_progress",
  "completed",
];

/** The platform's decision and its payment confirmation; a tenant cannot set these on itself. */
export const SETUP_REQUEST_PLATFORM_STATUSES: readonly DeviceSetupRequestStatus[] = [
  "awaiting_payment",
  "ready_for_installation",
  "rejected",
];

export function isDeviceSetupRequestStatus(value: string): value is DeviceSetupRequestStatus {
  return DEVICE_SETUP_REQUEST_STATUSES.includes(value as DeviceSetupRequestStatus);
}

export function canTransitionSetupRequest(
  from: DeviceSetupRequestStatus,
  to: DeviceSetupRequestStatus,
): boolean {
  return DEVICE_SETUP_REQUEST_TRANSITIONS[from]?.includes(to) ?? false;
}
