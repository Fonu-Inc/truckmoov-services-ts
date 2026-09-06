export type StoredGeofenceAlertRead = {
  id: string;
  tenantId: string;
  alertId: string;
  readBy: string;
  readAt: Date;
};

export interface GeofenceAlertReadRepository {
  markRead(reads: StoredGeofenceAlertRead[]): Promise<void>;
  /** Read state is per person: one dispatcher clearing the panel does not clear it for everyone. */
  findReadAlertIds(tenantId: string, readBy: string): Promise<string[]>;
}

export const GEOFENCE_ALERT_READ_REPOSITORY = Symbol("GEOFENCE_ALERT_READ_REPOSITORY");
