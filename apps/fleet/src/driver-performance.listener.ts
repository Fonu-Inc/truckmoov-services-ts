import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import {
  DISPATCH_JOBS_READER,
  type DispatchJobsReader,
} from "./contexts/fleet/dispatch/domain/ports/dispatch-jobs-reader.port";
import {
  DRIVER_REPOSITORY,
  type DriverRepository,
} from "./contexts/fleet/drivers/domain/repositories/driver.repository";
import { calculateDriverPerformance } from "./contexts/fleet/drivers/domain/driver-performance";

type JobStatusChangedEvent = {
  tenantId?: string;
  jobId?: string;
  newStatus?: string;
  assignedDriverId?: string;
};

/**
 * Recomputes a driver's score when one of their jobs is delivered. Scoring on
 * the event rather than on read keeps the dashboard cheap, and means the score
 * is written from the punctuality dispatch captured at completion.
 */
@Injectable()
export class DriverPerformanceListener implements OnModuleInit {
  private readonly logger = new Logger(DriverPerformanceListener.name);

  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    @Inject(DISPATCH_JOBS_READER) private readonly dispatchJobs: DispatchJobsReader,
    @Inject(DRIVER_REPOSITORY) private readonly driverRepo: DriverRepository,
  ) {}

  onModuleInit(): void {
    this.bus.subscribe("tm.*.job.status.changed", async (event) => {
      const payload = (event as { data?: JobStatusChangedEvent })?.data ?? (event as JobStatusChangedEvent);
      if (payload?.newStatus !== "delivered") return;
      await this.recalculate(payload);
    });
  }

  private async recalculate(event: JobStatusChangedEvent): Promise<void> {
    const tenantId = event.tenantId?.trim();
    const driverId = event.assignedDriverId?.trim();
    if (!tenantId || !driverId) return;

    try {
      const driver = await this.driverRepo.findById(driverId, tenantId);
      if (!driver) return;

      const jobs = await this.dispatchJobs.listJobs(tenantId);
      const punctualities = jobs
        .filter((job) => job.assignedDriverId === driverId && job.punctuality !== null)
        .map((job) => job.punctuality!);

      const performance = calculateDriverPerformance(punctualities);
      if (!performance) return;

      await this.driverRepo.save(
        driver.withPerformance(performance.score, performance.jobsScored, new Date().toISOString()),
      );
    } catch (error) {
      // A score is a nicety on a dashboard; failing here must not break the
      // job status pipeline that produced the event.
      this.logger.warn(
        `driver performance recalculation failed for driver ${driverId}: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  }
}
