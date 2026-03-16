import { Injectable, Logger } from "@nestjs/common";
import { BoundingBox, LatLng } from "./geofence.types";

@Injectable()
export class GeofenceService {
  private readonly logger = new Logger(GeofenceService.name);
  private readonly geofences = new Map<string, BoundingBox>();
  private readonly prevState = new Map<string, boolean>();

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

  checkTransition(vehicleId: string, point: LatLng): "entered" | "exited" | null {
    const now = this.isInside(vehicleId, point);
    const prev = this.prevState.get(vehicleId);
    this.prevState.set(vehicleId, now);
    if (prev === undefined) return null;
    if (!prev && now) return "entered";
    if (prev && !now) return "exited";
    return null;
  }

  clear(vehicleId: string) {
    this.geofences.delete(vehicleId);
    this.prevState.delete(vehicleId);
  }
}
