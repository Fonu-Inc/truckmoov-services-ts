import { DEVICE_LIFECYCLE_ONLINE, type DeviceLifecycleStatus } from "@shared/devices";

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
 * The status dropdown. Four of these are lifecycle projections; `unassigned`
 * and `unregistered` are not — they cut across the lifecycle, which is why the
 * filter cannot just be a lifecycle equality check.
 */
export const DEVICE_STATUS_FILTERS = [
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

const STATUS_FILTER_PREDICATES: Record<DeviceStatusFilter, (row: DeviceInventoryRow) => boolean> = {
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
): boolean {
  return STATUS_FILTER_PREDICATES[filter](row);
}

export function applyDeviceStatusFilter<T extends DeviceInventoryRow>(
  rows: T[],
  filter: DeviceStatusFilter | undefined,
): T[] {
  if (!filter) return rows;
  return rows.filter((row) => matchesDeviceStatusFilter(row, filter));
}

export type DeviceStatusCounts = {
  total: number;
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
export function summarizeDeviceStatuses(rows: DeviceInventoryRow[]): DeviceStatusCounts {
  const count = (filter: DeviceStatusFilter) =>
    rows.filter((row) => matchesDeviceStatusFilter(row, filter)).length;

  return {
    total: rows.length,
    active: count("active"),
    registered: count("registered"),
    assigned: count("assigned"),
    unassigned: count("unassigned"),
    configured: count("configured"),
    suspended: rows.filter((row) => row.lifecycleStatus === "suspended").length,
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
