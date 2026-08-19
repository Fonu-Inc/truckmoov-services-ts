export type MaintenanceIntervalType = "date" | "mileage" | "both" | "months";
export type MaintenanceMileageSource = "telemetry" | "manual";
export type MaintenanceLifecycleStatus = "overdue" | "due" | "upcoming" | "completed";

export type StoredMaintenanceProfile = {
  id: string;
  tenantId: string;
  vehicleId: string;
  serviceType: string;
  serviceLabel: string;
  intervalType: MaintenanceIntervalType;
  intervalDays: number | null;
  intervalMonths: number | null;
  intervalKm: number | null;
  lastServiceDate: string | null;
  lastServiceMileage: number | null;
  currentMileage: number | null;
  mileageSource: MaintenanceMileageSource;
  nextDueDate: string | null;
  nextDueMileage: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MaintenanceProfileFilters = {
  vehicleId?: string;
  lifecycleStatus?: MaintenanceLifecycleStatus;
  nextDueDateFrom?: string;
  nextDueDateTo?: string;
  currentMileageMin?: number;
  currentMileageMax?: number;
};

export interface MaintenanceProfileRepository {
  save(profile: StoredMaintenanceProfile): Promise<void>;
  findById(id: string, tenantId: string): Promise<StoredMaintenanceProfile | null>;
  findAllByTenant(tenantId: string, filters?: MaintenanceProfileFilters): Promise<StoredMaintenanceProfile[]>;
  deleteById(id: string, tenantId: string): Promise<void>;
}

export const MAINTENANCE_PROFILE_REPOSITORY = Symbol("MAINTENANCE_PROFILE_REPOSITORY");

export const MAINTENANCE_SERVICE_CATEGORIES = [
  "oil_change",
  "tire_rotation",
  "brake_inspection",
  "transmission_service",
  "coolant_flush",
  "air_filter",
  "fuel_filter",
  "battery_check",
  "wheel_alignment",
  "general_inspection",
] as const;

export function computeLifecycleStatus(profile: StoredMaintenanceProfile): MaintenanceLifecycleStatus {
  const today = new Date().toISOString().slice(0, 10);
  const soonDays = 14;
  const soonDate = new Date();
  soonDate.setDate(soonDate.getDate() + soonDays);
  const soonStr = soonDate.toISOString().slice(0, 10);

  if (profile.nextDueDate) {
    if (profile.nextDueDate < today) return "overdue";
    if (profile.nextDueDate <= soonStr) return "due";
    return "upcoming";
  }
  if (profile.nextDueMileage && profile.currentMileage) {
    if (profile.currentMileage >= profile.nextDueMileage) return "overdue";
    if (profile.currentMileage >= profile.nextDueMileage - 500) return "due";
    return "upcoming";
  }
  return "upcoming";
}
