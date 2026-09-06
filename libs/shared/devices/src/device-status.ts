/**
 * One device vocabulary for the whole platform. The installation screen and the
 * platform device list previously offered different sets, so the same device
 * read as "assignable" on one and something else on the other.
 *
 * lifecycle_status is the source of truth. status is a coarser projection kept
 * for the tenant-facing list; it is always derived, never set independently.
 */
export const DEVICE_LIFECYCLE_STATUSES = [
  "registered",
  "config_pending",
  "configured",
  "verified_online",
  "assignable",
  "assigned",
  "faulty",
  // Imposed by the platform, not reached by the install workflow. A suspended
  // device keeps the state it was in so reinstating it does not restart the
  // installation.
  "suspended",
  "decommissioned",
] as const;

export const DEVICE_STATUSES = [
  "registered",
  "configured",
  "assigned",
  "active",
  "faulty",
  "suspended",
  "decommissioned",
] as const;

export const DEVICE_PROVISION_STATUSES = ["pending", "registered", "failed"] as const;

export type DeviceLifecycleStatus = (typeof DEVICE_LIFECYCLE_STATUSES)[number];
export type DeviceStatus = (typeof DEVICE_STATUSES)[number];
export type DeviceProvisionStatus = (typeof DEVICE_PROVISION_STATUSES)[number];

export function isDeviceProvisionStatus(value: string): value is DeviceProvisionStatus {
  return DEVICE_PROVISION_STATUSES.includes(value as DeviceProvisionStatus);
}

export function isDeviceLifecycleStatus(value: string): value is DeviceLifecycleStatus {
  return DEVICE_LIFECYCLE_STATUSES.includes(value as DeviceLifecycleStatus);
}

export function isDeviceStatus(value: string): value is DeviceStatus {
  return DEVICE_STATUSES.includes(value as DeviceStatus);
}

export function deviceStatusFromLifecycle(status: DeviceLifecycleStatus): DeviceStatus {
  switch (status) {
    case "registered":
    case "config_pending":
      return "registered";
    case "configured":
      return "configured";
    case "verified_online":
    case "assignable":
      return "active";
    case "assigned":
      return "assigned";
    case "faulty":
      return "faulty";
    case "suspended":
      return "suspended";
    case "decommissioned":
      return "decommissioned";
  }
}

/** Lifecycle states that mean the device is installed and reporting. */
export const DEVICE_LIFECYCLE_ONLINE: readonly DeviceLifecycleStatus[] = [
  "verified_online",
  "assignable",
  "assigned",
];

/**
 * Inverts the projection: which lifecycle states present as this coarse status.
 * Callers filter on lifecycle_status alone, so a row whose derived status
 * column has drifted still lands in the right bucket.
 */
export function lifecycleStatusesFor(status: string): DeviceLifecycleStatus[] {
  const wanted = status.trim().toLowerCase();
  return DEVICE_LIFECYCLE_STATUSES.filter(
    (lifecycle) => deviceStatusFromLifecycle(lifecycle) === wanted,
  );
}
