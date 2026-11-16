import { Inject, Injectable } from "@nestjs/common";
import { DEVICE_REPOSITORY, type DeviceRepository } from "../../domain/repositories/device.repository";
import { TRACCAR_TRIPS_PROVIDER, type TraccarTripsProvider } from "../../domain/ports/traccar-trips.port";

const DEFAULT_LOOKBACK_DAYS = 30;

export type VehicleTrip = {
  from: string | null;
  to: string | null;
  date: string;
  distanceKm: number;
  durationMinutes: number;
  status: "completed";
};

@Injectable()
export class ListVehicleTripsUseCase {
  constructor(
    @Inject(DEVICE_REPOSITORY) private readonly deviceRepository: DeviceRepository,
    @Inject(TRACCAR_TRIPS_PROVIDER) private readonly tripsProvider: TraccarTripsProvider,
  ) {}

  async execute(vehicleId: string, tenantId: string, lookbackDays = DEFAULT_LOOKBACK_DAYS): Promise<VehicleTrip[]> {
    const device = await this.deviceRepository.findByVehicleId(vehicleId, tenantId);
    const primitives = device?.toPrimitives();
    const traccarDeviceId = primitives?.traccarDeviceId;
    if (!traccarDeviceId) return [];

    const to = new Date();
    // A reused IMEI keeps its Traccar history, so nothing before this tenant's row or this vehicle's assignment.
    const from = new Date(Math.max(
      to.getTime() - lookbackDays * 24 * 60 * 60 * 1000,
      Date.parse(primitives.createdAt ?? "") || 0,
      Date.parse(primitives.assignedAt ?? "") || 0,
    ));
    if (from >= to) return [];

    let trips;
    try {
      trips = await this.tripsProvider.getTrips(traccarDeviceId, from, to);
    } catch {
      return [];
    }

    return trips
      .map((trip) => ({
        from: trip.startAddress,
        to: trip.endAddress,
        date: trip.startTime,
        distanceKm: Math.round((trip.distanceMeters / 1000) * 10) / 10,
        durationMinutes: Math.round(trip.durationMs / 60000),
        status: "completed" as const,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }
}
