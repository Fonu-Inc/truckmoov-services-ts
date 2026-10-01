import { DEVICE_LIFECYCLE_ONLINE, type DeviceLifecycleStatus } from "@shared/devices";
import { deviceHeartbeat, type HeartbeatWindow } from "./device-heartbeat";

/**
 * A row as the inventory list and the status cards read it. Deliberately
 * narrower than the device itself: everything here is either projected or
 * counted, and widening it invites the summary to disagree with the list.
 */
export type DeviceInventoryRow = {
  lifecycleStatus: DeviceLifecycleStatus;
  vehicleId: string | null;
  provisionStatus?: string | null;
  lastSeen?: string | null;
};

/**
 * The status dropdown. `online` and `offline` read the heartbeat, `unassigned`
 * and `unregistered` cut across the lifecycle, and the rest are lifecycle
 * projections, which is why the filter cannot just be a lifecycle equality
 * check. `active` is the lifecycle reading and does not mean reporting now.
 */
export const DEVICE_STATUS_FILTERS = [
  "online",
  "offline",
  "suspended",
  "active",
  "assigned",
  "unassigned",
  "configured",
  "registered",
  "unregistered",
] as const;

export type DeviceStatusFilter = (typeof DEVICE_STATUS_FILTERS)[number];

export function isDeviceStatusFilter(value: string): value is DeviceStatusFilter {
  return (DEVICE_STATUS_FILTERS as readonly string[]).includes(value);
}

/**
 * Registered here means registered *with the telemetry platform*, not the
 * `registered` lifecycle state. A device the platform has not accepted cannot
 * report, whatever the installer has done to it, so it is worth its own filter.
 */
function isRegisteredUpstream(row: DeviceInventoryRow): boolean {
  return row.provisionStatus === "registered";
}

/** Suspended and decommissioned devices are not expected to report. */
const OUT_OF_SERVICE: readonly DeviceLifecycleStatus[] = ["suspended", "decommissioned"];

function isInService(row: DeviceInventoryRow): boolean {
  return !OUT_OF_SERVICE.includes(row.lifecycleStatus);
}

/**
 * Online, offline, suspended and decommissioned partition the inventory. A
 * device that has never reported is offline: it is in service and not
 * reporting, and the `never` last-seen bucket separates it when that matters.
 */
function isOnline(row: DeviceInventoryRow, window: HeartbeatWindow): boolean {
  return isInService(row) && deviceHeartbeat(row.lastSeen, window) === "online";
}

type StatusPredicate = (row: DeviceInventoryRow, window: HeartbeatWindow) => boolean;

const STATUS_FILTER_PREDICATES: Record<DeviceStatusFilter, StatusPredicate> = {
  online: isOnline,
  offline: (row, window) => isInService(row) && !isOnline(row, window),
  suspended: (row) => row.lifecycleStatus === "suspended",
  active: (row) => DEVICE_LIFECYCLE_ONLINE.includes(row.lifecycleStatus),
  assigned: (row) => row.vehicleId !== null,
  unassigned: (row) => row.vehicleId === null,
  configured: (row) => row.lifecycleStatus === "configured",
  registered: (row) => row.lifecycleStatus === "registered" || row.lifecycleStatus === "config_pending",
  unregistered: (row) => !isRegisteredUpstream(row),
};

export function matchesDeviceStatusFilter(
  row: DeviceInventoryRow,
  filter: DeviceStatusFilter,
  window: HeartbeatWindow,
): boolean {
  return STATUS_FILTER_PREDICATES[filter](row, window);
}

export function applyDeviceStatusFilter<T extends DeviceInventoryRow>(
  rows: T[],
  filter: DeviceStatusFilter | undefined,
  window: HeartbeatWindow,
): T[] {
  if (!filter) return rows;
  return rows.filter((row) => matchesDeviceStatusFilter(row, filter, window));
}

export type DeviceStatusCounts = {
  total: number;
  online: number;
  offline: number;
  active: number;
  registered: number;
  assigned: number;
  unassigned: number;
  configured: number;
  suspended: number;
};

/**
 * The status cards. Counted from the same predicates the filter uses, so
 * clicking a card and reading its number can never disagree.
 */
export function summarizeDeviceStatuses(rows: DeviceInventoryRow[], window: HeartbeatWindow): DeviceStatusCounts {
  const count = (filter: DeviceStatusFilter) =>
    rows.filter((row) => matchesDeviceStatusFilter(row, filter, window)).length;

  return {
    total: rows.length,
    online: count("online"),
    offline: count("offline"),
    active: count("active"),
    registered: count("registered"),
    assigned: count("assigned"),
    unassigned: count("unassigned"),
    configured: count("configured"),
    suspended: count("suspended"),
  };
}

export const DEVICE_LAST_SEEN_FILTERS = [
  { value: "5min", label: "Last 5 minutes" },
  { value: "1hr", label: "Last hour" },
  { value: "24hr", label: "Last 24 hours" },
  { value: "7day", label: "Last 7 days" },
  { value: "never", label: "Never seen" },
] as const;

const STATUS_FILTER_LABELS: Record<DeviceStatusFilter, string> = {
  online: "Online",
  offline: "Offline",
  suspended: "Suspended",
  active: "Active",
  assigned: "Assigned",
  unassigned: "Unassigned",
  configured: "Configured",
  registered: "Registered",
  unregistered: "Unregistered",
};

export function deviceStatusFilterOptions() {
  return DEVICE_STATUS_FILTERS.map((value) => ({ value, label: STATUS_FILTER_LABELS[value] }));
}
