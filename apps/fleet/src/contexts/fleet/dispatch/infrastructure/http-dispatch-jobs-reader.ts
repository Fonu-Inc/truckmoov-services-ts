import { Inject, Injectable, Logger } from "@nestjs/common";
import { createHmac } from "crypto";
import axios from "axios";
import { AppConfigService } from "@shared/config";
import type {
  DispatchJob,
  DispatchJobFilters,
  DispatchJobsReader,
} from "../domain/ports/dispatch-jobs-reader.port";

const REQUEST_TIMEOUT_MS = 10_000;
const TOKEN_TTL_SECONDS = 300;

type DispatchJobEnvelope = {
  status?: boolean;
  message?: string;
  data?: DispatchJobApi[] | null;
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
