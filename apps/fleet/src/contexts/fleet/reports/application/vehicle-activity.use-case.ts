import { Inject, Injectable } from "@nestjs/common";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "../../vehicles/domain/repositories/vehicle.repository";
import { DRIVER_REPOSITORY, type DriverRepository } from "../../drivers/domain/repositories/driver.repository";
import { DISPATCH_JOBS_READER, type DispatchJobsReader } from "../../dispatch/domain/ports/dispatch-jobs-reader.port";
import type { DispatchJob } from "../../dispatch/domain/ports/dispatch-jobs-reader.port";
import { isCompletedJob } from "../domain/report-jobs";

export type VehicleActivityQuery = { search?: string; status?: string; page: number; limit: number };

export type VehicleTrip = {
  id: string;
  reference: string;
  status: string;
  date: string;
  vehicle: string | null;
  driver: string | null;
  from: string | null;
  to: string | null;
  amountNgn: number;
};

export type VehicleActivity = {
  totals: { trips: number; completed: number; open: number; locationsServed: number; tripValueNgn: number };
  statuses: string[];
  items: VehicleTrip[];
  page: number;
  limit: number;
  total: number;
};

/** Dispatch jobs as trips, newest first, with the vehicle and driver named. Totals ignore the filters. */
@Injectable()
export class VehicleActivityUseCase {
  constructor(
    @Inject(VEHICLE_REPOSITORY) private readonly vehicles: VehicleRepository,
    @Inject(DRIVER_REPOSITORY) private readonly drivers: DriverRepository,
    @Inject(DISPATCH_JOBS_READER) private readonly dispatchJobs: DispatchJobsReader,
  ) {}

  async execute(tenantId: string, query: VehicleActivityQuery): Promise<VehicleActivity> {
    const [vehicles, drivers, jobs] = await Promise.all([
      this.vehicles.findAll({ tenantId }),
      this.drivers.findAll({ tenantId }),
      this.dispatchJobs.listJobs(tenantId),
    ]);
    const plates = new Map(vehicles.map((v) => [v.id, v.registrationNumber]));
    const names = new Map(drivers.map((d) => [d.id, d.name]));
    const trips = jobs
      .slice()
      .sort((a, b) => Date.parse(b.createdAt || "0") - Date.parse(a.createdAt || "0"))
      .map((j) => toTrip(j, plates, names));

    const matching = trips.filter((t) => matchesStatus(t, query.status) && matchesSearch(t, query.search));
    const start = (query.page - 1) * query.limit;
    const completed = jobs.filter(isCompletedJob).length;

    return {
      totals: {
        trips: trips.length,
        completed,
        open: trips.length - completed,
        locationsServed: new Set(trips.map((t) => t.to).filter(Boolean)).size,
        tripValueNgn: trips.reduce((sum, t) => sum + t.amountNgn, 0),
      },
      statuses: [...new Set(trips.map((t) => t.status).filter(Boolean))],
      items: matching.slice(start, start + query.limit),
      page: query.page,
      limit: query.limit,
      total: matching.length,
    };
  }
}

function toTrip(job: DispatchJob, plates: Map<string, string>, names: Map<string, string>): VehicleTrip {
  return {
    id: job.id,
    reference: job.reference,
    status: job.status,
    date: job.createdAt,
    vehicle: (job.assignedVehicleId && plates.get(job.assignedVehicleId)) || null,
    driver: (job.assignedDriverId && names.get(job.assignedDriverId)) || null,
    from: job.pickupAddress,
    to: job.dropoffAddress,
    amountNgn: job.amountNgn,
  };
}

const matchesStatus = (trip: VehicleTrip, status?: string) => !status || trip.status === status;

function matchesSearch(trip: VehicleTrip, search?: string): boolean {
  const q = search?.trim().toLowerCase();
  if (!q) return true;
  return [trip.reference, trip.vehicle, trip.driver, trip.from, trip.to].some((v) => v?.toLowerCase().includes(q));
}
