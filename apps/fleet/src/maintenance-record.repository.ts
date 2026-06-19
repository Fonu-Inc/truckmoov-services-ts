export type MaintenanceRecordStatus = "scheduled" | "in_progress" | "completed" | "cancelled";
export type MaintenanceRecordPriority = "low" | "medium" | "high" | "critical";

export type StoredMaintenanceRecord = {
  id: string;
  tenantId: string;
  vehicleId: string;
  maintenanceType: string;
  description: string | null;
  status: MaintenanceRecordStatus;
  priority: MaintenanceRecordPriority;
  scheduledDate: string | null;
  completedDate: string | null;
  cost: number | null;
  currency: string;
  technician: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MaintenanceRecordFilters = {
  vehicleId?: string;
  status?: MaintenanceRecordStatus | "overdue";
  priority?: MaintenanceRecordPriority;
  maintenanceType?: string;
  search?: string;
  costMin?: number;
  costMax?: number;
};

export interface MaintenanceRecordRepository {
  save(record: StoredMaintenanceRecord): Promise<void>;
  findById(id: string): Promise<StoredMaintenanceRecord | null>;
  findAllByTenant(tenantId: string, filters?: MaintenanceRecordFilters): Promise<StoredMaintenanceRecord[]>;
  deleteById(id: string): Promise<void>;
}

export const MAINTENANCE_RECORD_REPOSITORY = Symbol("MAINTENANCE_RECORD_REPOSITORY");
