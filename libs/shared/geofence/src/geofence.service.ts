import { Injectable, Logger } from "@nestjs/common";
import { BoundingBox, LatLng } from "./geofence.types";

@Injectable()
export class GeofenceService {
  private readonly logger = new Logger(GeofenceService.name);
  private readonly geofences = new Map<string, BoundingBox>();

  set(vehicleId: string, box: BoundingBox) {
    this.geofences.set(vehicleId, box);
    this.logger.debug(`Geofence stored for vehicle ${vehicleId}`);
  }

  get(vehicleId: string): BoundingBox | null {
    return this.geofences.get(vehicleId) ?? null;
  }

  isInside(vehicleId: string, point: LatLng): boolean {
    const box = this.geofences.get(vehicleId);
    if (!box) {
      return true;
    }

    const { northeast, southwest } = box;
    const withinLat = point.lat >= southwest.lat && point.lat <= northeast.lat;
    const withinLng = point.lng >= southwest.lng && point.lng <= northeast.lng;
    return withinLat && withinLng;
  }

  clear(vehicleId: string) {
    this.geofences.delete(vehicleId);
  }
}
