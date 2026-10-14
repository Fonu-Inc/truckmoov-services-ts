export type StoredZoneOccupancy = {
  id: string;
  tenantId: string;
  vehicleId: string;
  zoneId: string;
  enteredAt: Date;
  /** Set once a dwell alert has been raised for this stay, so it fires once. */
  dwellNotifiedAt: Date | null;
  /** Set once a speeding alert has been raised for this stay. */
  speedingNotifiedAt: Date | null;
};

export type ZoneOccupantCount = { zoneId: string; vehicles: number };

/**
 * Which vehicles are inside which zones, right now.
 *
 * Persisted rather than held in memory: membership is the only record of where
 * a vehicle already was, so losing it on restart would replay every entry as
 * new, and two replicas holding separate copies would each raise their own
 * alerts for the same crossing.
 */
export interface ZoneOccupancyRepository {
  findByVehicle(tenantId: string, vehicleId: string): Promise<StoredZoneOccupancy[]>;
  enter(occupancy: StoredZoneOccupancy): Promise<void>;
  exit(tenantId: string, vehicleId: string, zoneIds: string[]): Promise<void>;
  markDwellNotified(tenantId: string, vehicleId: string, zoneId: string, at: Date): Promise<void>;
  /** Marks the stay as alerted for speeding; true only for the first caller of the stay. */
  claimSpeedingAlert(tenantId: string, vehicleId: string, zoneId: string, at: Date): Promise<boolean>;
  /**
   * Makes the zone's occupants match the vehicles whose last position it
   * covers, without raising alerts: after a zone is drawn or edited, trucks
   * already parked in it did not enter it, and trucks it no longer covers did
   * not leave.
   */
  syncZone(tenantId: string, zoneId: string): Promise<void>;
  countByZone(tenantId: string): Promise<ZoneOccupantCount[]>;
  listOccupants(tenantId: string, zoneId: string): Promise<StoredZoneOccupancy[]>;
  /**
   * Stays old enough to be worth a dwell check, across every tenant. The sweep
   * that raises them runs platform-wide, so this deliberately takes no tenant.
   */
  findPendingDwell(olderThan: Date, limit: number): Promise<StoredZoneOccupancy[]>;
}

export const ZONE_OCCUPANCY_REPOSITORY = Symbol("ZONE_OCCUPANCY_REPOSITORY");
