import { Inject, Injectable } from "@nestjs/common";
import { DISPATCH_JOBS_READER, type DispatchJobsReader } from "../../dispatch/domain/ports/dispatch-jobs-reader.port";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "../../vehicles/domain/repositories/vehicle.repository";

export type DeliveryMetrics = {
  totalJobs: number;
  delivered: number;
  cancelled: number;
  inProgress: number;
  deliverySuccessRate: number;
  averageCycleTimeMs: number | null;
  vehicleUtilizationRate: number;
  generatedAt: string;
};

@Injectable()
export class DeliveryMetricsUseCase {
  constructor(
    @Inject(DISPATCH_JOBS_READER) private readonly dispatchJobs: DispatchJobsReader,
    @Inject(VEHICLE_REPOSITORY) private readonly vehicleRepo: VehicleRepository,
  ) {}

  async execute(tenantId: string): Promise<DeliveryMetrics> {
    const [jobs, vehicles] = await Promise.all([
      this.dispatchJobs.listJobs(tenantId),
      this.vehicleRepo.findAll({ tenantId }),
    ]);

    const delivered = jobs.filter((j) => j.status === "delivered");
    const cancelled = jobs.filter((j) => j.status === "cancelled");
    const inProgress = jobs.filter((j) => !["delivered", "cancelled"].includes(j.status));
    const completed = delivered.length + cancelled.length;
    const deliverySuccessRate = completed > 0 ? delivered.length / completed : 0;

    const cycleTimes = delivered
      .filter((j) => j.createdAt && j.updatedAt)
      .map((j) => new Date(j.updatedAt).getTime() - new Date(j.createdAt).getTime())
      .filter((ms) => ms >= 0);

    const averageCycleTimeMs = cycleTimes.length
      ? cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length
      : null;

    const activeVehicles = vehicles.filter((v) => v.status === "active").length;
    const vehicleUtilizationRate = vehicles.length > 0 ? activeVehicles / vehicles.length : 0;

    return {
      totalJobs: jobs.length,
      delivered: delivered.length,
      cancelled: cancelled.length,
      inProgress: inProgress.length,
      deliverySuccessRate: Math.round(deliverySuccessRate * 1000) / 10,
      averageCycleTimeMs,
      vehicleUtilizationRate: Math.round(vehicleUtilizationRate * 1000) / 10,
      generatedAt: new Date().toISOString(),
    };
  }
}
