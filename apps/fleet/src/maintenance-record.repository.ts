export const MAINTENANCE_RECORD_STATUSES = ["scheduled", "in_progress", "completed", "cancelled"] as const;
export const MAINTENANCE_RECORD_PRIORITIES = ["low", "medium", "high", "critical"] as const;

export type MaintenanceRecordStatus = (typeof MAINTENANCE_RECORD_STATUSES)[number];
export type MaintenanceRecordPriority = (typeof MAINTENANCE_RECORD_PRIORITIES)[number];

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

export type CreateMaintenanceRecordInput = {
  vehicleId: string;
  maintenanceType: string;
  status?: MaintenanceRecordStatus;
  priority: MaintenanceRecordPriority;
  currency?: string;
  description?: string | null;
  scheduledDate?: string | null;
  completedDate?: string | null;
  cost?: number | null;
  technician?: string | null;
  notes?: string | null;
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
  findById(id: string, tenantId: string): Promise<StoredMaintenanceRecord | null>;
  findAllByTenant(tenantId: string, filters?: MaintenanceRecordFilters): Promise<StoredMaintenanceRecord[]>;
  deleteById(id: string, tenantId: string): Promise<void>;
}

export const MAINTENANCE_RECORD_REPOSITORY = Symbol("MAINTENANCE_RECORD_REPOSITORY");
