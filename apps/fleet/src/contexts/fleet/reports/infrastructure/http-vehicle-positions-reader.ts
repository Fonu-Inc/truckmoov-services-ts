import { Inject, Injectable, Logger } from "@nestjs/common";
import { createHmac } from "node:crypto";
import axios from "axios";
import { AppConfigService } from "@shared/config";
import type {
  VehiclePosition,
  VehiclePositionsReader,
} from "../domain/ports/vehicle-positions-reader.port";

const REQUEST_TIMEOUT_MS = 5_000;
const TOKEN_TTL_SECONDS = 300;

type LatestLocationApi = {
  vehicle_id?: string;
  latitude?: number;
  longitude?: number;
  speed_kph?: number | null;
  recorded_at?: string;
  occurred_at?: string;
};

type LatestLocationEnvelope = {
  data?: LatestLocationApi[] | null;
};

@Injectable()
export class HttpVehiclePositionsReader implements VehiclePositionsReader {
  private readonly logger = new Logger(HttpVehiclePositionsReader.name);

  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async listLatestPositions(tenantId: string): Promise<VehiclePosition[]> {
    const token = this.buildServiceToken(tenantId);
    if (!token) {
      this.logger.warn("tracking read skipped: missing JWT secret or tenant");
      return [];
    }

    try {
      const baseUrl = this.config.overview.trackingServiceUrl.replace(/\/+$/, "");
      const res = await axios.get<LatestLocationEnvelope>(`${baseUrl}/tracking/vehicles`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: REQUEST_TIMEOUT_MS,
        validateStatus: () => true,
      });

      if (res.status < 200 || res.status >= 300 || !Array.isArray(res.data?.data)) {
        this.logger.warn(`tracking read returned ${res.status}; degrading to no positions`);
        return [];
      }

      return res.data.data
        .filter((position) => typeof position.latitude === "number" && typeof position.longitude === "number")
        .map((position) => ({
          vehicleId: position.vehicle_id ?? "",
          latitude: position.latitude as number,
          longitude: position.longitude as number,
          speedKph: position.speed_kph ?? null,
          recordedAt: position.recorded_at ?? position.occurred_at ?? "",
        }));
    } catch (err) {
      this.logger.warn(`tracking read failed: ${(err as Error).message}; degrading to no positions`);
      return [];
    }
  }

  private buildServiceToken(tenantId: string): string | null {
    const secret = this.config.auth.jwtSecret;
    const tid = tenantId?.trim();
    if (!secret || !tid) return null;

    const payload = {
      sub: "fleet-service",
      email: "fleet-service@truckmoov.local",
      role: "FLEET_ADMIN",
      tenantId: tid,
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
    return `${encodedPayload}.${signature}`;
  }
}
