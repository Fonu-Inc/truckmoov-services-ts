import type { JobPunctuality } from "../../../drivers/domain/driver-performance";

export type DispatchJob = {
  id: string;
  reference: string;
  status: string;
  assignedVehicleId: string | null;
  assignedDriverId: string | null;
  amountNgn: number;
  createdAt: string;
  updatedAt: string;
  deliveredAt?: string | null;
  pickupAddress: string | null;
  dropoffAddress: string | null;
  deadline: string | null;
  punctuality: JobPunctuality | null;
  podUploadedAt?: string[];
};

export type DispatchJobFilters = {
  /** One status, a dispatch keyword, or a comma list matching any of them, e.g. "assigned,en-route". */
  status?: string;
  driverId?: string;
  vehicleId?: string;
};

export type DispatchJobWaypoint = {
  sequence: number;
  type: "pickup" | "stop" | "dropoff";
  address: string;
  latitude: number | null;
  longitude: number | null;
};

export type DispatchActiveJob = {
  jobId: string;
  reference: string;
  status: string;
  assignedDriverId: string | null;
  assignedVehicleId: string | null;
  waypoints: DispatchJobWaypoint[];
  routeShape: string | null;
  routeEncoding: string | null;
};

export type DispatchActiveJobsMap = {
  jobs: DispatchActiveJob[];
  counts: {
    activeDeliveries: number;
    stops: number;
    pickups: number;
    dropoffs: number;
  };
};

export interface DispatchJobsReader {
  listJobs(tenantId: string, filters?: DispatchJobFilters): Promise<DispatchJob[]>;
  /** One job, or null when it doesn't exist or dispatch can't be reached. */
  getJob(tenantId: string, jobId: string): Promise<DispatchJob | null>;
  listActiveJobsMap(tenantId: string): Promise<DispatchActiveJobsMap>;
}

export const DISPATCH_JOBS_READER = Symbol("DISPATCH_JOBS_READER");

export const EMPTY_ACTIVE_JOBS_MAP: DispatchActiveJobsMap = {
  jobs: [],
  counts: { activeDeliveries: 0, stops: 0, pickups: 0, dropoffs: 0 },
};
