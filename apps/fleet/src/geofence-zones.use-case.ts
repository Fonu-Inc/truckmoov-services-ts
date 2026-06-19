import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import {
  GEOFENCE_ZONE_REPOSITORY,
  type GeofenceZoneRepository,
  type GeofenceZoneFilters,
  type GeoCoordinate,
  type GeofenceZoneStatus,
} from "./geofence-zone.repository";

export class GeofenceZoneNotFoundError extends Error {}

@Injectable()
export class GeofenceZonesUseCase {
  constructor(
    @Inject(GEOFENCE_ZONE_REPOSITORY)
    private readonly repo: GeofenceZoneRepository,
  ) {}

  async list(tenantId: string, filters?: GeofenceZoneFilters) {
    return this.repo.findAllByTenant(tenantId, filters ?? { status: "ACTIVE" });
  }

  async create(tenantId: string, data: {
    name: string;
    description?: string | null;
    coordinates: GeoCoordinate[];
    radiusMeters?: number | null;
  }) {
    const zone = {
      id: randomUUID(),
      tenantId,
      name: data.name,
      description: data.description ?? null,
      coordinates: data.coordinates,
      radiusMeters: data.radiusMeters ?? null,
      status: "ACTIVE" as GeofenceZoneStatus,
      assignedVehicleIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await this.repo.save(zone);
    return zone;
  }

  async update(tenantId: string, id: string, data: Partial<{
    name: string;
    description: string | null;
    coordinates: GeoCoordinate[];
    radiusMeters: number | null;
    status: GeofenceZoneStatus;
  }>) {
    const zone = await this.repo.findById(id);
    if (!zone || zone.tenantId !== tenantId) throw new GeofenceZoneNotFoundError();
    const updated = { ...zone, ...data, updatedAt: new Date() };
    await this.repo.save(updated);
    return updated;
  }

  async delete(tenantId: string, id: string) {
    const zone = await this.repo.findById(id);
    if (!zone || zone.tenantId !== tenantId) throw new GeofenceZoneNotFoundError();
    await this.repo.save({ ...zone, status: "ARCHIVED", updatedAt: new Date() });
  }

  async setVehicleAssignments(tenantId: string, id: string, vehicleIds: string[]) {
    const zone = await this.repo.findById(id);
    if (!zone || zone.tenantId !== tenantId) throw new GeofenceZoneNotFoundError();
    await this.repo.setVehicleAssignments(id, tenantId, vehicleIds);
    return { ...zone, assignedVehicleIds: vehicleIds };
  }
}
