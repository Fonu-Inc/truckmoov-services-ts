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
  ) {}

  async list(tenantId: string, filters?: MaintenanceProfileFilters & { lifecycleStatus?: MaintenanceLifecycleStatus }) {
    const profiles = await this.repo.findAllByTenant(tenantId, filters);
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
      vehicleId: data.vehicleId,
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

  async delete(tenantId: string, id: string) {
    const profile = await this.repo.findById(id);
    if (!profile || profile.tenantId !== tenantId) throw new MaintenanceProfileNotFoundError();
    await this.repo.deleteById(id);
  }

  async complete(tenantId: string, id: string) {
    const profile = await this.repo.findById(id);
    if (!profile || profile.tenantId !== tenantId) throw new MaintenanceProfileNotFoundError();
    const today = new Date().toISOString().slice(0, 10);
    const updated: StoredMaintenanceProfile = {
      ...profile,
      lastServiceDate: today,
      lastServiceMileage: profile.currentMileage,
      nextDueDate: profile.intervalDays
        ? (() => {
            const d = new Date();
            d.setDate(d.getDate() + profile.intervalDays!);
            return d.toISOString().slice(0, 10);
          })()
        : profile.intervalMonths
          ? (() => {
              const d = new Date();
              d.setMonth(d.getMonth() + profile.intervalMonths!);
              return d.toISOString().slice(0, 10);
            })()
          : null,
      nextDueMileage: profile.intervalKm && profile.currentMileage
        ? profile.currentMileage + profile.intervalKm
        : profile.nextDueMileage,
      updatedAt: new Date(),
    };
    await this.repo.save(updated);
    return { ...updated, lifecycleStatus: computeLifecycleStatus(updated) };
  }

  async summary(tenantId: string) {
    const profiles = await this.repo.findAllByTenant(tenantId);
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

  async export(tenantId: string): Promise<string> {
    const profiles = await this.repo.findAllByTenant(tenantId);
    const headers = ["id", "vehicleId", "serviceType", "serviceLabel", "intervalType", "nextDueDate", "nextDueMileage", "lastServiceDate", "lifecycleStatus"];
    const rows = [
      headers.join(","),
      ...profiles.map((p) => {
        const status = computeLifecycleStatus(p);
        return headers.map((h) => JSON.stringify(h === "lifecycleStatus" ? status : (p as Record<string, unknown>)[h] ?? "")).join(",");
      }),
    ];
    return rows.join("\n");
  }
}
