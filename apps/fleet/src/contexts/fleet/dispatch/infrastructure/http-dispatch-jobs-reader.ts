import { Inject, Injectable, Logger } from "@nestjs/common";
import { createHmac } from "crypto";
import axios from "axios";
import { AppConfigService } from "@shared/config";
import type {
  DispatchActiveJobsMap,
  DispatchJob,
  DispatchJobFilters,
  DispatchJobWaypoint,
  DispatchJobsReader,
} from "../domain/ports/dispatch-jobs-reader.port";
import { EMPTY_ACTIVE_JOBS_MAP } from "../domain/ports/dispatch-jobs-reader.port";

const REQUEST_TIMEOUT_MS = 10_000;
const TOKEN_TTL_SECONDS = 300;

type DispatchJobEnvelope = {
  status?: boolean;
  message?: string;
  data?: DispatchJobApi[] | null;
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
  deadline?: string;
  pickup?: DispatchJobStopApi;
  dropoff?: DispatchJobStopApi;
  punctuality?: DispatchJobPunctualityApi | null;
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

  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async listJobs(tenantId: string, filters?: DispatchJobFilters): Promise<DispatchJob[]> {
    const token = this.buildServiceToken(tenantId);
    if (!token) {
      this.logger.warn("dispatch read skipped: missing JWT secret or tenant");
      return [];
    }

    try {
      const res = await axios.get<DispatchJobEnvelope>(`${this.baseUrl()}/dispatch/jobs`, {
        params: filters?.status ? { status: filters.status } : undefined,
        headers: { Authorization: `Bearer ${token}` },
        timeout: REQUEST_TIMEOUT_MS,
        validateStatus: () => true,
      });

      if (res.status < 200 || res.status >= 300 || !Array.isArray(res.data?.data)) {
        this.logger.warn(`dispatch read returned ${res.status}; degrading to empty jobs`);
        return [];
      }

      return res.data.data.map((j) => this.toDomain(j));
    } catch (err) {
      this.logger.warn(`dispatch read failed: ${(err as Error).message}; degrading to empty jobs`);
      return [];
    }
  }

  async listActiveJobsMap(tenantId: string): Promise<DispatchActiveJobsMap> {
    const token = this.buildServiceToken(tenantId);
    if (!token) {
      this.logger.warn("dispatch map read skipped: missing JWT secret or tenant");
      return EMPTY_ACTIVE_JOBS_MAP;
    }

    try {
      const res = await axios.get<DispatchActiveJobsMapEnvelope>(`${this.baseUrl()}/dispatch/jobs/map`, {
        headers: { Authorization: `Bearer ${token}` },
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
    };
  }

  private baseUrl(): string {
    return this.config.dispatch.serviceUrl.replace(/\/+$/, "");
  }

  private buildServiceToken(tenantId: string): string | null {
    const secret = this.config.auth.jwtSecret;
    const tid = tenantId?.trim();
    if (!secret || !tid) return null;

    const payload = {
      sub: "fleet-service",
      email: "fleet-service@truckmoov.local",
      role: "DISPATCHER",
      tenantId: tid,
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
    return `${encodedPayload}.${signature}`;
  }
}
