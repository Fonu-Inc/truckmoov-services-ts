import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import {
  MAINTENANCE_PROFILE_REPOSITORY,
  MAINTENANCE_SERVICE_CATEGORIES,
  type MaintenanceIntervalType,
  type MaintenanceMileageSource,
  type MaintenanceProfileFilters,
  type MaintenanceProfileRepository,
  type MaintenanceLifecycleStatus,
  type StoredMaintenanceProfile,
  computeLifecycleStatus,
} from "./maintenance-profile.repository";
import { isVehicleAllowed, onlyAllowedVehicles, type AllowedVehicleIds } from "./allowed-vehicles";
import { toCsv } from "./utils/csv";
import { lagosToday } from "./utils/lagos-date";
import { VEHICLE_REPOSITORY } from "./contexts/fleet/vehicles";
import type { VehicleRepository } from "./contexts/fleet/vehicles/domain/repositories/vehicle.repository";
import { knownVehicleId } from "./vehicle-reference";

export class MaintenanceProfileNotFoundError extends Error {}

export type CreateMaintenanceProfileInput = {
  vehicleId: string;
  serviceType: string;
  serviceLabel: string;
  intervalType: MaintenanceIntervalType;
  mileageSource: MaintenanceMileageSource;
  intervalDays?: number | null;
  intervalMonths?: number | null;
  intervalKm?: number | null;
  lastServiceDate?: string | null;
  lastServiceMileage?: number | null;
  currentMileage?: number | null;
  nextDueDate?: string | null;
  nextDueMileage?: number | null;
};

@Injectable()
export class MaintenanceProfilesUseCase {
  constructor(
    @Inject(MAINTENANCE_PROFILE_REPOSITORY)
    private readonly repo: MaintenanceProfileRepository,
    @Inject(VEHICLE_REPOSITORY)
    private readonly vehicles: VehicleRepository,
  ) {}

  async list(
    tenantId: string,
    filters?: MaintenanceProfileFilters & { lifecycleStatus?: MaintenanceLifecycleStatus },
    allowed?: AllowedVehicleIds,
  ) {
    const profiles = onlyAllowedVehicles(await this.repo.findAllByTenant(tenantId, filters), allowed);
    const withStatus = profiles.map((p) => ({ ...p, lifecycleStatus: computeLifecycleStatus(p) }));
    if (filters?.lifecycleStatus) {
      return withStatus.filter((p) => p.lifecycleStatus === filters.lifecycleStatus);
    }
    return withStatus;
  }

  async create(tenantId: string, data: CreateMaintenanceProfileInput) {
    const profile: StoredMaintenanceProfile = {
      id: randomUUID(),
      tenantId,
      vehicleId: await knownVehicleId(this.vehicles, data.vehicleId, tenantId),
      serviceType: data.serviceType,
      serviceLabel: data.serviceLabel,
      intervalType: data.intervalType,
      intervalDays: data.intervalDays ?? null,
      intervalMonths: data.intervalMonths ?? null,
      intervalKm: data.intervalKm ?? null,
      lastServiceDate: data.lastServiceDate ?? null,
      lastServiceMileage: data.lastServiceMileage ?? null,
      currentMileage: data.currentMileage ?? null,
      mileageSource: data.mileageSource,
      nextDueDate: data.nextDueDate ?? null,
      nextDueMileage: data.nextDueMileage ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await this.repo.save(profile);
    return { ...profile, lifecycleStatus: computeLifecycleStatus(profile) };
  }

  private async findProfile(tenantId: string, id: string, allowed?: AllowedVehicleIds): Promise<StoredMaintenanceProfile> {
    const profile = await this.repo.findById(id, tenantId);
    // Another owner's profile reads as missing, not as forbidden.
    if (!profile || profile.tenantId !== tenantId || !isVehicleAllowed(profile.vehicleId, allowed)) {
      throw new MaintenanceProfileNotFoundError();
    }
    return profile;
  }

  async delete(tenantId: string, id: string, allowed?: AllowedVehicleIds) {
    await this.findProfile(tenantId, id, allowed);
    await this.repo.deleteById(id, tenantId);
  }

  async complete(tenantId: string, id: string, allowed?: AllowedVehicleIds) {
    const profile = await this.findProfile(tenantId, id, allowed);
    const today = lagosToday();
    const updated: StoredMaintenanceProfile = {
      ...profile,
      lastServiceDate: today,
      lastServiceMileage: profile.currentMileage,
      nextDueDate: nextDueDateFrom(today, profile),
      nextDueMileage: profile.intervalKm && profile.currentMileage
        ? profile.currentMileage + profile.intervalKm
        : profile.nextDueMileage,
      updatedAt: new Date(),
    };
    await this.repo.save(updated);
    return { ...updated, lifecycleStatus: computeLifecycleStatus(updated) };
  }

  async summary(tenantId: string, allowed?: AllowedVehicleIds) {
    const profiles = onlyAllowedVehicles(await this.repo.findAllByTenant(tenantId), allowed);
    const counts = { total: profiles.length, overdue: 0, due: 0, upcoming: 0, completed: 0 };
    for (const p of profiles) {
      const status = computeLifecycleStatus(p);
      if (status === "overdue") counts.overdue++;
      else if (status === "due") counts.due++;
      else if (status === "upcoming") counts.upcoming++;
      else if (status === "completed") counts.completed++;
    }
    return counts;
  }

  serviceCategories() {
    return MAINTENANCE_SERVICE_CATEGORIES;
  }

  async export(tenantId: string, allowed?: AllowedVehicleIds): Promise<string> {
    const profiles = onlyAllowedVehicles(await this.repo.findAllByTenant(tenantId), allowed);
    const headers = ["id", "vehicleId", "serviceType", "serviceLabel", "intervalType", "nextDueDate", "nextDueMileage", "lastServiceDate", "lifecycleStatus"];
    return toCsv(profiles.map((p) => ({ ...p, lifecycleStatus: computeLifecycleStatus(p) })), headers);
  }
}

function nextDueDateFrom(today: string, profile: StoredMaintenanceProfile): string | null {
  const day = new Date(`${today}T00:00:00Z`);
  if (profile.intervalDays) day.setUTCDate(day.getUTCDate() + profile.intervalDays);
  else if (profile.intervalMonths) day.setUTCMonth(day.getUTCMonth() + profile.intervalMonths);
  else return null;
  return day.toISOString().slice(0, 10);
}
