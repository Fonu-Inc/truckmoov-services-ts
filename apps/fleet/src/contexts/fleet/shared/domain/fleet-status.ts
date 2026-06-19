export const FLEET_ASSET_STATUSES = ["active", "inactive", "maintenance", "decommissioned"] as const;

export type FleetAssetStatus = (typeof FLEET_ASSET_STATUSES)[number];

export function isFleetAssetStatus(value: string): value is FleetAssetStatus {
  return FLEET_ASSET_STATUSES.includes(value as FleetAssetStatus);
}
