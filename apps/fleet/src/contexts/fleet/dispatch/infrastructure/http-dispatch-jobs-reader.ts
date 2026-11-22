import { Inject, Injectable, Logger } from "@nestjs/common";
import axios from "axios";
import { AppConfigService } from "@shared/config";
import { type ServiceCaller, createServiceCaller } from "@shared/identity";
import type {
  DispatchActiveJobsMap,
  DispatchJob,
  DispatchJobFilters,
  DispatchJobWaypoint,
  DispatchJobsReader,
} from "../domain/ports/dispatch-jobs-reader.port";
import { EMPTY_ACTIVE_JOBS_MAP } from "../domain/ports/dispatch-jobs-reader.port";

const REQUEST_TIMEOUT_MS = 10_000;
const JOBS_PAGE_SIZE = 100;
// shortcut: stops at 5,000 jobs per tenant, move aggregates into Go once a tenant gets near it.
const MAX_JOBS_PAGES = 50;

type DispatchJobEnvelope = {
  status?: boolean;
  message?: string;
  data?: DispatchJobApi[] | null;
  meta?: { total?: number; page?: number; limit?: number; totalPages?: number } | null;
};

type DispatchJobStopApi = {
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
};

type DispatchJobPunctualityApi = {
  deadline?: string;
  completed_at?: string;
  traffic_allowance_seconds?: number;
  lateness_seconds?: number;
  on_time?: boolean;
};

type DispatchJobApi = {
  id?: string;
  reference?: string;
  status?: string;
  assigned_vehicle_id?: string;
  assigned_driver_id?: string;
  amount_ngn?: number;
  created_at?: string;
  updated_at?: string;
  delivered_at?: string | null;
  deadline?: string;
  pickup?: DispatchJobStopApi;
  dropoff?: DispatchJobStopApi;
  punctuality?: DispatchJobPunctualityApi | null;
  pod_attachments?: Array<{ uploaded_at?: string }> | null;
};

type DispatchActiveJobApi = {
  job_id?: string;
  reference?: string;
  status?: string;
  assigned_driver_id?: string;
  assigned_vehicle_id?: string;
  route_shape?: string;
  route_encoding?: string;
  waypoints?: Array<{
    sequence?: number;
    type?: string;
    address?: string;
    latitude?: number | null;
    longitude?: number | null;
  }>;
};

type DispatchActiveJobsMapEnvelope = {
  data?: {
    jobs?: DispatchActiveJobApi[] | null;
    counts?: {
      active_deliveries?: number;
      stops?: number;
      pickups?: number;
      dropoffs?: number;
    } | null;
  } | null;
};

@Injectable()
export class HttpDispatchJobsReader implements DispatchJobsReader {
  private readonly logger = new Logger(HttpDispatchJobsReader.name);

  private readonly caller: ServiceCaller;

  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {
    this.caller = createServiceCaller(config, "fleet");
  }

  async listJobs(tenantId: string, filters?: DispatchJobFilters): Promise<DispatchJob[]> {
    const headers = this.caller.headers("dispatch", { tenantId, legacyRole: "DISPATCHER" });
    if (!headers) {
      this.logger.warn("dispatch read skipped: missing JWT secret or tenant");
      return [];
    }

    const jobs: DispatchJob[] = [];
    try {
      for (let page = 1; page <= MAX_JOBS_PAGES; page++) {
        const res = await axios.get<DispatchJobEnvelope>(`${this.baseUrl()}/dispatch/jobs`, {
          params: { ...(filters?.status ? { status: filters.status } : {}), page, limit: JOBS_PAGE_SIZE },
          headers,
          timeout: REQUEST_TIMEOUT_MS,
          validateStatus: () => true,
        });

        if (res.status < 200 || res.status >= 300 || !Array.isArray(res.data?.data)) {
          this.logger.warn(`dispatch read returned ${res.status} on page ${page}; degrading to ${jobs.length} jobs`);
          return jobs;
        }

        jobs.push(...res.data.data.map((j) => this.toDomain(j)));
        const totalPages = res.data.meta?.totalPages;
        const done = totalPages !== undefined ? page >= totalPages : res.data.data.length < JOBS_PAGE_SIZE;
        if (done) return jobs;
      }
      this.logger.warn(`dispatch read stopped at ${MAX_JOBS_PAGES} pages (${jobs.length} jobs)`);
      return jobs;
    } catch (err) {
      this.logger.warn(`dispatch read failed: ${(err as Error).message}; degrading to ${jobs.length} jobs`);
      return jobs;
    }
  }

  async listActiveJobsMap(tenantId: string): Promise<DispatchActiveJobsMap> {
    const headers = this.caller.headers("dispatch", { tenantId, legacyRole: "DISPATCHER" });
    if (!headers) {
      this.logger.warn("dispatch map read skipped: missing JWT secret or tenant");
      return EMPTY_ACTIVE_JOBS_MAP;
    }

    try {
      const res = await axios.get<DispatchActiveJobsMapEnvelope>(`${this.baseUrl()}/dispatch/jobs/map`, {
        headers,
        timeout: REQUEST_TIMEOUT_MS,
        validateStatus: () => true,
      });

      if (res.status < 200 || res.status >= 300 || !res.data?.data) {
        this.logger.warn(`dispatch map read returned ${res.status}; degrading to an empty map`);
        return EMPTY_ACTIVE_JOBS_MAP;
      }

      const payload = res.data.data;
      return {
        jobs: (payload.jobs ?? []).map((job) => ({
          jobId: job.job_id ?? "",
          reference: job.reference ?? "",
          status: job.status ?? "",
          assignedDriverId: job.assigned_driver_id ?? null,
          assignedVehicleId: job.assigned_vehicle_id ?? null,
          routeShape: job.route_shape ?? null,
          routeEncoding: job.route_encoding ?? null,
          waypoints: (job.waypoints ?? []).map((waypoint, index) => this.toWaypoint(waypoint, index)),
        })),
        counts: {
          activeDeliveries: payload.counts?.active_deliveries ?? 0,
          stops: payload.counts?.stops ?? 0,
          pickups: payload.counts?.pickups ?? 0,
          dropoffs: payload.counts?.dropoffs ?? 0,
        },
      };
    } catch (err) {
      this.logger.warn(`dispatch map read failed: ${(err as Error).message}; degrading to an empty map`);
      return EMPTY_ACTIVE_JOBS_MAP;
    }
  }

  private toWaypoint(
    waypoint: { sequence?: number; type?: string; address?: string; latitude?: number | null; longitude?: number | null },
    index: number,
  ): DispatchJobWaypoint {
    const type = waypoint.type === "pickup" || waypoint.type === "dropoff" ? waypoint.type : "stop";
    return {
      sequence: waypoint.sequence ?? index,
      type,
      address: waypoint.address ?? "",
      latitude: waypoint.latitude ?? null,
      longitude: waypoint.longitude ?? null,
    };
  }

  private toDomain(j: DispatchJobApi): DispatchJob {
    return {
      id: j.id ?? "",
      reference: j.reference ?? "",
      status: j.status ?? "",
      assignedVehicleId: j.assigned_vehicle_id ?? null,
      assignedDriverId: j.assigned_driver_id ?? null,
      amountNgn: j.amount_ngn ?? 0,
      createdAt: j.created_at ?? "",
      updatedAt: j.updated_at ?? "",
      deliveredAt: j.delivered_at ?? null,
      pickupAddress: j.pickup?.address ?? null,
      dropoffAddress: j.dropoff?.address ?? null,
      deadline: j.deadline ?? null,
      punctuality: j.punctuality
        ? {
            deadline: j.punctuality.deadline ?? "",
            completedAt: j.punctuality.completed_at ?? "",
            trafficAllowanceSeconds: j.punctuality.traffic_allowance_seconds ?? 0,
            latenessSeconds: j.punctuality.lateness_seconds ?? 0,
            onTime: j.punctuality.on_time ?? false,
          }
        : null,
      podUploadedAt: (j.pod_attachments ?? []).flatMap((a) => (a.uploaded_at ? [a.uploaded_at] : [])),
    };
  }

  private baseUrl(): string {
    return this.config.dispatch.serviceUrl.replace(/\/+$/, "");
  }
}
