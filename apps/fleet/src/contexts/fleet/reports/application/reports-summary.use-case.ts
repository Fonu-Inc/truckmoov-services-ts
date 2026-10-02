import { Inject, Injectable } from "@nestjs/common";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "../../vehicles/domain/repositories/vehicle.repository";
import { DRIVER_REPOSITORY, type DriverRepository } from "../../drivers/domain/repositories/driver.repository";
import { DISPATCH_JOBS_READER, type DispatchJobsReader } from "../../dispatch/domain/ports/dispatch-jobs-reader.port";
import { FUEL_RECORD_REPOSITORY, type FuelRecordRepository } from "../../fuel/domain/repositories/fuel-record.repository";
import { DOCUMENT_REPOSITORY, type DocumentRepository } from "../../documents/domain/document.repository";
import type { DispatchJob } from "../../dispatch/domain/ports/dispatch-jobs-reader.port";
import { isCompletedJob, isJobOnTheRoad, jobCompletedAt } from "../domain/report-jobs";
import { isWithin, reportPeriodWindow, type ReportPeriod, type ReportWindow } from "../domain/report-window";

export type ReportsSummary = {
  period: { from: string; to: string };
  operations: { jobsCreated: number; jobsCompleted: number; jobsInProgress: number; jobsCancelled: number };
  fleet: { vehiclesAdded: number; driversAdded: number; vehiclesInMaintenance: number; activeVehicles: number; totalVehicles: number };
  administration: { documentsUploaded: number; driverCommunications: number; fuelEntries: number };
  revenueNgn: number;
};

/** Daily and weekly summary counts for the Reports page, in Lagos time. */
@Injectable()
export class ReportsSummaryUseCase {
  constructor(
    @Inject(VEHICLE_REPOSITORY) private readonly vehicles: VehicleRepository,
    @Inject(DRIVER_REPOSITORY) private readonly drivers: DriverRepository,
    @Inject(DISPATCH_JOBS_READER) private readonly dispatchJobs: DispatchJobsReader,
    @Inject(FUEL_RECORD_REPOSITORY) private readonly fuel: FuelRecordRepository,
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: DocumentRepository,
  ) {}

  async execute(tenantId: string, period: ReportPeriod): Promise<ReportsSummary> {
    const window = reportPeriodWindow(period);
    const [vehicles, drivers, jobs, fuelEntries, uploads] = await Promise.all([
      this.vehicles.findAll({ tenantId }),
      this.drivers.findAll({ tenantId }),
      this.dispatchJobs.listJobs(tenantId),
      this.fuel.findAll({ tenantId, from: window.from.toISOString(), to: window.to.toISOString() }),
      this.documents.countUploadedBetween(tenantId, window.from, window.to),
    ]);

    const created = jobs.filter((j) => isWithin(j.createdAt, window));
    const completed = jobs.filter((j) => isCompletedJob(j) && isWithin(jobCompletedAt(j), window));

    return {
      period: { from: window.from.toISOString(), to: window.to.toISOString() },
      operations: {
        jobsCreated: created.length,
        jobsCompleted: completed.length,
        jobsInProgress: jobs.filter(isJobOnTheRoad).length,
        jobsCancelled: jobs.filter((j) => j.status === "cancelled" && isWithin(j.updatedAt, window)).length,
      },
      fleet: {
        vehiclesAdded: vehicles.filter((v) => isWithin(v.createdAt, window)).length,
        driversAdded: drivers.filter((d) => isWithin(d.createdAt, window)).length,
        vehiclesInMaintenance: vehicles.filter((v) => v.status === "maintenance").length,
        activeVehicles: vehicles.filter((v) => v.status === "active").length,
        totalVehicles: vehicles.length,
      },
      administration: {
        documentsUploaded: uploads + podUploadsWithin(jobs, window),
        // Every job booked with a driver sends that driver a dispatch notification.
        driverCommunications: created.filter((j) => j.assignedDriverId).length,
        fuelEntries: fuelEntries.length,
      },
      revenueNgn: completed.reduce((sum, j) => sum + j.amountNgn, 0),
    };
  }
}

function podUploadsWithin(jobs: DispatchJob[], window: ReportWindow): number {
  return jobs.reduce((n, j) => n + (j.podUploadedAt ?? []).filter((at) => isWithin(at, window)).length, 0);
}
