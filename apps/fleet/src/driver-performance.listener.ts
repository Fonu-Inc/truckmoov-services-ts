import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
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
import { busVerifier } from "./verified-bus-handler";

type JobStatusChangedEvent = {
  new_status?: string;
  assigned_driver_id?: string;
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
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  onModuleInit(): void {
    this.bus.subscribe("tm.*.job.status.changed", busVerifier(this.config, this.logger)(async (event) => {
      const payload = event.data as JobStatusChangedEvent;
      if (payload?.new_status !== "delivered") return;
      await this.recalculate(event.tenant_id, payload);
    }), "driver_performance");
  }

  private async recalculate(tenant: string | undefined, event: JobStatusChangedEvent): Promise<void> {
    const tenantId = tenant?.trim();
    const driverId = event.assigned_driver_id?.trim();
    if (!tenantId || !driverId) return;

    try {
      const driver = await this.driverRepo.findById(driverId, tenantId);
      if (!driver) return;

      // Punctuality is only recorded on delivered jobs, so read just this driver's.
      const jobs = await this.dispatchJobs.listJobs(tenantId, { status: "delivered", driverId });
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
