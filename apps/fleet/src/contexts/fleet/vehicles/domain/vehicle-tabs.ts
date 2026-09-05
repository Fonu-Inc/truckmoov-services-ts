export const VEHICLE_TAB_HEADER = "tabs";

export const VEHICLE_TABS = [
  "vehicles",
  "maintenance",
  "fuel",
  "compliance",
  "financials",
  "analytics",
] as const;

export type VehicleTab = (typeof VEHICLE_TABS)[number];

export const DEFAULT_VEHICLE_TAB: VehicleTab = "vehicles";

/**
 * Unknown values fall back to the vehicles list rather than erroring: a tab
 * name is a view preference, and a typo in it should not take the page down.
 */
export function resolveVehicleTab(raw?: string): VehicleTab {
  const candidate = raw?.trim().toLowerCase();
  return candidate && (VEHICLE_TABS as readonly string[]).includes(candidate)
    ? (candidate as VehicleTab)
    : DEFAULT_VEHICLE_TAB;
}
