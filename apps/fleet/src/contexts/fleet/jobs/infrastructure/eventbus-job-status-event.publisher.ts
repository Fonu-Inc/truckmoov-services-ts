import { Inject, Injectable } from "@nestjs/common";
import {
  EVENT_BUS,
  type EventBus,
  type EventEnvelope,
} from "../../../../../../../libs/shared/eventbus/src";
import type { JobStatusChangedEvent } from "../domain/events/job-status-changed.event";
import type { JobStatusEventPublisher } from "../domain/ports/job-status-event.publisher";

@Injectable()
export class EventBusJobStatusEventPublisher implements JobStatusEventPublisher {
  constructor(@Inject(EVENT_BUS) private readonly eventBus: EventBus) {}

  async publish(event: JobStatusChangedEvent): Promise<void> {
    // Domain event subject convention is centralized here so use-cases stay broker-agnostic.
    const subject = `tm.${event.tenant_id}.job.status.changed`;
    await this.eventBus.publish(subject, event as EventEnvelope);
  }
}
