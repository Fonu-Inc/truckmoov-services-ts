import { Inject, Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { Job } from "./contexts/fleet/jobs/domain/entities/job.entity";
import { JOB_REPOSITORY, type JobRepository } from "./contexts/fleet/jobs/domain/repositories/job.repository";

@Injectable()
export class JobSyncListener implements OnApplicationBootstrap {
  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    @Inject(JOB_REPOSITORY) private readonly jobRepo: JobRepository,
  ) {}

  async onApplicationBootstrap() {
    await this.bus.subscribe("tm.*.job.status.changed", async (envelope) => {
      const d = envelope.data;
      const jobId = d["job_id"] as string;
      const newStatus = d["new_status"] as string;
      const now = envelope.occurred_at;

      const existing = await this.jobRepo.findByJobId(jobId);
      const base = existing?.toPrimitives() ?? {
        jobId,
        tenantId: envelope.tenant_id,
        status: newStatus,
        updatedAt: now,
      };

      const patch: typeof base = {
        ...base,
        status: newStatus,
        updatedAt: now,
        assignedDriverId: (d["assigned_driver_id"] as string) || base.assignedDriverId,
        assignedVehicleId: (d["assigned_vehicle_id"] as string) || base.assignedVehicleId,
        assignedAt: newStatus === "assigned" ? now : base.assignedAt,
        deliveredAt: newStatus === "delivered" ? now : base.deliveredAt,
        cancelledAt: newStatus === "cancelled" ? now : base.cancelledAt,
      };

      await this.jobRepo.save(Job.create(patch));
    });
  }
}
