import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import {
  GEOFENCE_ZONE_REPOSITORY,
  type GeofenceZoneRepository,
  type GeofenceZoneFilters,
  type GeoCoordinate,
  type GeofenceZoneStatus,
  type StoredGeofenceZone,
} from "./geofence-zone.repository";

export class GeofenceZoneNotFoundError extends Error {}

type GeofenceZoneInput = {
  name: string;
  description?: string | null;
  zoneType?: string;
  shape?: "CIRCLE" | "POLYGON";
  center?: { latitude: number; longitude: number } | null;
  coordinates: GeoCoordinate[];
  radiusMeters?: number | null;
  category?: string;
  entryAlertsEnabled?: boolean;
  exitAlertsEnabled?: boolean;
  dwellAlertsEnabled?: boolean;
  dwellMinutes?: number | null;
  speedLimit?: { enabled?: boolean; limitKph?: number | null };
  schedule?: { enabled?: boolean; timezone?: string | null; days?: string[]; startTime?: string | null; endTime?: string | null };
  assignedVehicleIds?: string[];
};

/** Maps the flat, MikroORM-shaped repository record into the nested API response shape the UI expects. */
export function toApiShape(zone: StoredGeofenceZone) {
  const shape = zone.centerLatitude != null && zone.centerLongitude != null ? ("CIRCLE" as const) : ("POLYGON" as const);
  return {
    id: zone.id,
    tenantId: zone.tenantId,
    name: zone.name,
    description: zone.description,
    zoneType: zone.zoneType,
    shape,
    center: shape === "CIRCLE" ? { latitude: zone.centerLatitude as number, longitude: zone.centerLongitude as number } : null,
    coordinates: zone.coordinates,
    radiusMeters: zone.radiusMeters,
    status: zone.status,
    category: zone.category,
    alerts: {
      entry: zone.entryAlertsEnabled,
      exit: zone.exitAlertsEnabled,
      dwell: zone.dwellAlertsEnabled,
      dwellMinutes: zone.dwellMinutes,
      speedLimit: {
        enabled: zone.speedLimitEnabled,
        limitKph: zone.speedLimitKph,
      },
    },
    schedule: {
      enabled: zone.scheduleEnabled,
      timezone: zone.scheduleTimezone,
      days: zone.scheduleDays,
      startTime: zone.scheduleStartTime,
      endTime: zone.scheduleEndTime,
    },
    assignedVehicleIds: zone.assignedVehicleIds,
    createdAt: zone.createdAt,
    updatedAt: zone.updatedAt,
  };
}

@Injectable()
export class GeofenceZonesUseCase {
  constructor(
    @Inject(GEOFENCE_ZONE_REPOSITORY)
    private readonly repo: GeofenceZoneRepository,
  ) {}

  async list(tenantId: string, filters?: GeofenceZoneFilters) {
    const zones = await this.repo.findAllByTenant(tenantId, filters ?? { status: "ACTIVE" });
    return zones.map(toApiShape);
  }

  async get(tenantId: string, id: string) {
    const zone = await this.repo.findById(id);
    if (!zone || zone.tenantId !== tenantId) throw new GeofenceZoneNotFoundError();
    return toApiShape(zone);
  }

  async create(tenantId: string, data: GeofenceZoneInput) {
    const id = randomUUID();
    const now = new Date();
    const zone: StoredGeofenceZone = {
      id,
      tenantId,
      name: data.name,
      description: data.description ?? null,
      zoneType: data.zoneType ?? "general",
      coordinates: data.coordinates,
      centerLatitude: data.center?.latitude ?? null,
      centerLongitude: data.center?.longitude ?? null,
      radiusMeters: data.radiusMeters ?? null,
      status: "ACTIVE" as GeofenceZoneStatus,
      category: data.category ?? "general",
      entryAlertsEnabled: data.entryAlertsEnabled ?? true,
      exitAlertsEnabled: data.exitAlertsEnabled ?? true,
      dwellAlertsEnabled: data.dwellAlertsEnabled ?? false,
      dwellMinutes: data.dwellMinutes ?? null,
      speedLimitEnabled: data.speedLimit?.enabled ?? false,
      speedLimitKph: data.speedLimit?.limitKph ?? null,
      scheduleEnabled: data.schedule?.enabled ?? false,
      scheduleTimezone: data.schedule?.timezone ?? null,
      scheduleDays: data.schedule?.days ?? [],
      scheduleStartTime: data.schedule?.startTime ?? null,
      scheduleEndTime: data.schedule?.endTime ?? null,
      assignedVehicleIds: [],
      createdAt: now,
      updatedAt: now,
    };
    await this.repo.save(zone);
    if (data.assignedVehicleIds?.length) {
      await this.repo.setVehicleAssignments(id, tenantId, data.assignedVehicleIds);
      zone.assignedVehicleIds = data.assignedVehicleIds;
    }
    return toApiShape(zone);
  }

  async update(tenantId: string, id: string, data: Partial<GeofenceZoneInput> & { status?: GeofenceZoneStatus }) {
    const zone = await this.repo.findById(id);
    if (!zone || zone.tenantId !== tenantId) throw new GeofenceZoneNotFoundError();

    const updated: StoredGeofenceZone = {
      ...zone,
      name: data.name ?? zone.name,
      description: data.description !== undefined ? data.description : zone.description,
      zoneType: data.zoneType ?? zone.zoneType,
      coordinates: data.coordinates ?? zone.coordinates,
      centerLatitude: data.center !== undefined ? (data.center?.latitude ?? null) : zone.centerLatitude,
      centerLongitude: data.center !== undefined ? (data.center?.longitude ?? null) : zone.centerLongitude,
      radiusMeters: data.radiusMeters !== undefined ? data.radiusMeters : zone.radiusMeters,
      status: data.status ?? zone.status,
      category: data.category ?? zone.category,
      entryAlertsEnabled: data.entryAlertsEnabled ?? zone.entryAlertsEnabled,
      exitAlertsEnabled: data.exitAlertsEnabled ?? zone.exitAlertsEnabled,
      dwellAlertsEnabled: data.dwellAlertsEnabled ?? zone.dwellAlertsEnabled,
      dwellMinutes: data.dwellMinutes !== undefined ? data.dwellMinutes : zone.dwellMinutes,
      speedLimitEnabled: data.speedLimit?.enabled ?? zone.speedLimitEnabled,
      speedLimitKph: data.speedLimit?.limitKph !== undefined ? data.speedLimit.limitKph : zone.speedLimitKph,
      scheduleEnabled: data.schedule?.enabled ?? zone.scheduleEnabled,
      scheduleTimezone: data.schedule?.timezone !== undefined ? data.schedule.timezone : zone.scheduleTimezone,
      scheduleDays: data.schedule?.days ?? zone.scheduleDays,
      scheduleStartTime: data.schedule?.startTime !== undefined ? data.schedule.startTime : zone.scheduleStartTime,
      scheduleEndTime: data.schedule?.endTime !== undefined ? data.schedule.endTime : zone.scheduleEndTime,
      updatedAt: new Date(),
    };
    await this.repo.save(updated);
    if (data.assignedVehicleIds) {
      await this.repo.setVehicleAssignments(id, tenantId, data.assignedVehicleIds);
      updated.assignedVehicleIds = data.assignedVehicleIds;
    }
    return toApiShape(updated);
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
    return toApiShape({ ...zone, assignedVehicleIds: vehicleIds });
  }
}
