import type { JobStatusChangedEvent } from "../events/job-status-changed.event";

export interface JobStatusEventPublisher {
  publish(event: JobStatusChangedEvent): Promise<void>;
}

export const JOB_STATUS_EVENT_PUBLISHER = Symbol("JOB_STATUS_EVENT_PUBLISHER");
