/**
 * Read-only view of a canonical job owned by the Go dispatch service.
 * Fleet financials/analytics/reports read these instead of the retired fleet_jobs stub.
 */
export type DispatchJob = {
  id: string;
  reference: string;
  status: string;
  assignedVehicleId: string | null;
  assignedDriverId: string | null;
  amountNgn: number;
  createdAt: string;
  updatedAt: string;
};

export type DispatchJobFilters = {
  status?: string;
};

export interface DispatchJobsReader {
  listJobs(tenantId: string, filters?: DispatchJobFilters): Promise<DispatchJob[]>;
}

export const DISPATCH_JOBS_READER = Symbol("DISPATCH_JOBS_READER");
