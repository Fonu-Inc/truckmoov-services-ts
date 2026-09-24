import type { InstallationOrderStatus } from './installation-order';
import type { StoredInstallationOrder } from './installation-order.repository';

export type JobSort = 'scheduled' | 'completion' | 'newest';

export type JobFilters = {
  installerId?: string;
  statuses?: readonly InstallationOrderStatus[];
  /** Job number, customer, any vehicle registration, city or state. */
  search?: string;
  /** Stored calendar dates: [from, before). */
  scheduledFrom?: Date;
  scheduledBefore?: Date;
  /** Instants on completed_at, falling back to cancelled_at: [from, to). */
  completedFrom?: Date;
  completedBefore?: Date;
  sort?: JobSort;
};

export type JobPageRequest = { page: number; limit: number };

/** One job with what its list row shows, read across the onboarding tables. */
export type JobRow = {
  order: StoredInstallationOrder;
  customerName: string;
  firstVehicle: { registrationNumber: string; make: string; model: string } | null;
  firstFleetDeviceId: string | null;
  vehicleCount: number;
  deviceCount: number;
};

export interface InstallationJobReader {
  list(filters: JobFilters, page: JobPageRequest): Promise<{ items: JobRow[]; total: number }>;
  count(filters: JobFilters): Promise<number>;
}

export const INSTALLATION_JOB_READER = Symbol('INSTALLATION_JOB_READER');
