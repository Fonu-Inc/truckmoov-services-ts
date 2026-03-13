import { Inject, Injectable } from "@nestjs/common";
import { FLEET_RUNTIME, type FleetRuntime } from "@fleet/shared/domain/ports/fleet-runtime.port";
import { JOB_STATUS_EVENT_PUBLISHER, type JobStatusEventPublisher } from "../../domain/ports/job-status-event.publisher";
import { createJobStatusChangedEvent } from "../../domain/events/job-status-changed.event";
import { Job } from "../../domain/entities/job.entity";
import { JOB_REPOSITORY, type JobRepository } from "../../domain/repositories/job.repository";

export type PublishJobStatusChangedCommand = {
  jobId: string;
  status?: string;
  tenantId?: string;
};

@Injectable()
export class PublishJobStatusChangedUseCase {
  constructor(
    @Inject(JOB_STATUS_EVENT_PUBLISHER)
    private readonly publisher: JobStatusEventPublisher,
    @Inject(JOB_REPOSITORY)
    private readonly jobRepository: JobRepository,
    @Inject(FLEET_RUNTIME)
    private readonly runtime: FleetRuntime,
  ) {}

  async execute(command: PublishJobStatusChangedCommand) {
    const tenantId = command.tenantId ?? this.runtime.getDefaultTenantId();
    const status = command.status ?? "assigned";

    const event = createJobStatusChangedEvent({
      id: this.runtime.generateId(),
      occurredAt: new Date().toISOString(),
      tenantId,
      jobId: command.jobId,
      newStatus: status,
    });

    const existingJob = await this.jobRepository.findByJobId(command.jobId);
    const job = existingJob
      ? existingJob.updateStatus(status, event.occurred_at)
      : Job.create({
          jobId: command.jobId,
          tenantId,
          status,
          updatedAt: event.occurred_at,
        });

    await this.jobRepository.save(job);
    await this.publisher.publish(event);

    return {
      published: true,
      subject: `tm.${tenantId}.job.status.changed`,
      envelope: event,
    };
  }
}
