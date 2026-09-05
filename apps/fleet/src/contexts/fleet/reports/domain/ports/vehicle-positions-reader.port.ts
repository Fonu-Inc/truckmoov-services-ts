export type VehiclePosition = {
  vehicleId: string;
  latitude: number;
  longitude: number;
  speedKph: number | null;
  recordedAt: string;
};

export interface VehiclePositionsReader {
  listLatestPositions(tenantId: string): Promise<VehiclePosition[]>;
}

export const VEHICLE_POSITIONS_READER = Symbol("VEHICLE_POSITIONS_READER");
