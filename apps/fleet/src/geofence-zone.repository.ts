export type GeofenceZoneStatus = "ACTIVE" | "ARCHIVED";

export type GeoCoordinate = [number, number];

export type StoredGeofenceZone = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  coordinates: GeoCoordinate[];
  radiusMeters: number | null;
  status: GeofenceZoneStatus;
  category: string;
  entryAlertsEnabled: boolean;
  exitAlertsEnabled: boolean;
  dwellAlertsEnabled: boolean;
  assignedVehicleIds: string[];
  createdAt: Date;
  updatedAt: Date;
};

export type GeofenceZoneFilters = {
  status?: GeofenceZoneStatus;
};

export interface GeofenceZoneRepository {
  save(zone: StoredGeofenceZone): Promise<void>;
  findById(id: string): Promise<StoredGeofenceZone | null>;
  findAllByTenant(tenantId: string, filters?: GeofenceZoneFilters): Promise<StoredGeofenceZone[]>;
  deleteById(id: string): Promise<void>;
  setVehicleAssignments(zoneId: string, tenantId: string, vehicleIds: string[]): Promise<void>;
}

export const GEOFENCE_ZONE_REPOSITORY = Symbol("GEOFENCE_ZONE_REPOSITORY");
