export type GeofenceZoneStatus = "ACTIVE" | "ARCHIVED";

export type GeoCoordinate = [number, number];

export type GeofenceCenter = { latitude: number; longitude: number };

export type GeofenceSpeedLimit = { enabled: boolean; limitKph: number | null };

export type GeofenceSchedule = {
  enabled: boolean;
  timezone: string | null;
  days: string[];
  startTime: string | null;
  endTime: string | null;
};

export type StoredGeofenceZone = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  zoneType: string;
  coordinates: GeoCoordinate[];
  centerLatitude: number | null;
  centerLongitude: number | null;
  radiusMeters: number | null;
  status: GeofenceZoneStatus;
  category: string;
  entryAlertsEnabled: boolean;
  exitAlertsEnabled: boolean;
  dwellAlertsEnabled: boolean;
  dwellMinutes: number | null;
  speedLimitEnabled: boolean;
  speedLimitKph: number | null;
  scheduleEnabled: boolean;
  scheduleTimezone: string | null;
  scheduleDays: string[];
  scheduleStartTime: string | null;
  scheduleEndTime: string | null;
  assignedVehicleIds: string[];
  createdAt: Date;
  updatedAt: Date;
};

/** An active zone relevant to one position, and whether it contains that position. */
export type PositionedZone = { zone: StoredGeofenceZone; inside: boolean };

export type GeofenceZoneFilters = {
  status?: GeofenceZoneStatus;
};

export interface GeofenceZoneRepository {
  save(zone: StoredGeofenceZone): Promise<void>;
  findById(id: string, tenantId: string): Promise<StoredGeofenceZone | null>;
  findAllByTenant(tenantId: string, filters?: GeofenceZoneFilters): Promise<StoredGeofenceZone[]>;
  deleteById(id: string, tenantId: string): Promise<void>;
  setVehicleAssignments(zoneId: string, tenantId: string, vehicleIds: string[]): Promise<void>;
  /**
   * Active zones that contain the point, plus the given held zones whether or
   * not they still do, so an exit can be told apart from a zone never entered.
   */
  findForPosition(
    tenantId: string,
    point: { lat: number; lng: number },
    heldZoneIds: readonly string[],
  ): Promise<PositionedZone[]>;
}

export const GEOFENCE_ZONE_REPOSITORY = Symbol("GEOFENCE_ZONE_REPOSITORY");
