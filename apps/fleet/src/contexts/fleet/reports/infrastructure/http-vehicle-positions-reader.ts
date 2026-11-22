import { Inject, Injectable, Logger } from "@nestjs/common";
import axios from "axios";
import { AppConfigService } from "@shared/config";
import { type ServiceCaller, createServiceCaller } from "@shared/identity";
import type {
  VehiclePosition,
  VehiclePositionsReader,
} from "../domain/ports/vehicle-positions-reader.port";

const REQUEST_TIMEOUT_MS = 5_000;

type LatestLocationApi = {
  vehicle_id?: string;
  latitude?: number;
  longitude?: number;
  speed_kph?: number | null;
  heading?: number | null;
  observed_at?: string;
  fix_time?: string;
  recorded_at?: string;
  occurred_at?: string;
};

type LatestLocationEnvelope = {
  data?: LatestLocationApi[] | null;
};

/** Tracking sends observed_at/fix_time; the older names are kept as fallbacks. */
export function positionTimestamp(position: LatestLocationApi): string {
  return position.observed_at || position.fix_time || position.recorded_at || position.occurred_at || "";
}

export function toVehiclePositions(rows: LatestLocationApi[]): VehiclePosition[] {
  return rows
    .filter((position) => typeof position.latitude === "number" && typeof position.longitude === "number")
    .map((position) => ({
      vehicleId: position.vehicle_id ?? "",
      latitude: position.latitude as number,
      longitude: position.longitude as number,
      speedKph: position.speed_kph ?? null,
      heading: position.heading ?? null,
      recordedAt: positionTimestamp(position),
    }));
}

@Injectable()
export class HttpVehiclePositionsReader implements VehiclePositionsReader {
  private readonly logger = new Logger(HttpVehiclePositionsReader.name);

  private readonly caller: ServiceCaller;

  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {
    this.caller = createServiceCaller(config, "fleet");
  }

  async listLatestPositions(tenantId: string): Promise<VehiclePosition[]> {
    const headers = this.caller.headers("tracking", { tenantId, legacyRole: "OWNER_OPERATOR" });
    if (!headers) {
      this.logger.warn("tracking read skipped: missing JWT secret or tenant");
      return [];
    }

    try {
      const baseUrl = this.config.overview.trackingServiceUrl.replace(/\/+$/, "");
      const res = await axios.get<LatestLocationEnvelope>(`${baseUrl}/tracking/vehicles`, {
        headers,
        timeout: REQUEST_TIMEOUT_MS,
        validateStatus: () => true,
      });

      if (res.status < 200 || res.status >= 300 || !Array.isArray(res.data?.data)) {
        this.logger.warn(`tracking read returned ${res.status}; degrading to no positions`);
        return [];
      }

      return toVehiclePositions(res.data.data);
    } catch (err) {
      this.logger.warn(`tracking read failed: ${(err as Error).message}; degrading to no positions`);
      return [];
    }
  }
}
