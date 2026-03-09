import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AppConfigService } from "@shared/config";
import { JOB_STATUS_EVENT_PUBLISHER, type JobStatusEventPublisher } from "../../domain/ports/job-status-event.publisher";
import { createJobStatusChangedEvent } from "../../domain/events/job-status-changed.event";

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
    private readonly config: AppConfigService,
  ) {}

  async execute(command: PublishJobStatusChangedCommand) {
    const tenantId = command.tenantId ?? this.config.fleet.defaultTenant;
    const status = command.status ?? "assigned";

    const event = createJobStatusChangedEvent({
      id: randomUUID(),
      occurredAt: new Date().toISOString(),
      tenantId,
      jobId: command.jobId,
      newStatus: status,
    });

    await this.publisher.publish(event);

    return {
      published: true,
      subject: `tm.${tenantId}.job.status.changed`,
      envelope: event,
    };
  }
}
