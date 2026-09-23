import { Injectable, Inject } from "@nestjs/common";
import axios from "axios";
import { AppConfigService } from "@shared/config";
import type { TraccarTrip, TraccarTripsProvider } from "../../domain/ports/traccar-trips.port";

const REQUEST_TIMEOUT_MS = 8000;

type TraccarReportTrip = {
  startTime: string;
  endTime: string;
  startAddress?: string | null;
  endAddress?: string | null;
  startLat?: number;
  startLon?: number;
  endLat?: number;
  endLon?: number;
  distance: number;
  duration: number;
};

@Injectable()
export class HttpTraccarTripsProvider implements TraccarTripsProvider {
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(@Inject(AppConfigService) config: AppConfigService) {
    this.baseUrl = config.traccar.baseUrl.replace(/\/+$/, "");
    const token = Buffer.from(
      `${config.traccar.serviceEmail}:${config.traccar.servicePassword}`,
    ).toString("base64");
    this.authHeader = `Basic ${token}`;
  }

  async getTrips(traccarDeviceId: string, from: Date, to: Date): Promise<TraccarTrip[]> {
    const res = await axios.get<TraccarReportTrip[]>(`${this.baseUrl}/api/reports/trips`, {
      params: { deviceId: traccarDeviceId, from: from.toISOString(), to: to.toISOString() },
      headers: { Accept: "application/json", Authorization: this.authHeader },
      validateStatus: () => true,
      timeout: REQUEST_TIMEOUT_MS,
    });

    if (res.status < 200 || res.status >= 300 || !Array.isArray(res.data)) {
      throw new Error(`traccar trips report failed (status ${res.status})`);
    }

    return res.data.map((trip) => ({
      startTime: trip.startTime,
      endTime: trip.endTime,
      startAddress: trip.startAddress?.trim() || this.coordsLabel(trip.startLat, trip.startLon),
      endAddress: trip.endAddress?.trim() || this.coordsLabel(trip.endLat, trip.endLon),
      distanceMeters: trip.distance,
      durationMs: trip.duration,
    }));
  }

  private coordsLabel(lat?: number, lon?: number): string | null {
    if (lat == null || lon == null) return null;
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  }
}
