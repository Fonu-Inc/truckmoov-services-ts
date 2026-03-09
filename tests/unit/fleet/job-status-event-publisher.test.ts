import { describe, expect, it } from "vitest";
import type { EventBus, EventEnvelope } from "@shared/eventbus";
import { EventBusJobStatusEventPublisher } from "../../../apps/fleet/src/contexts/fleet/jobs/infrastructure/eventbus-job-status-event.publisher";
import { createJobStatusChangedEvent } from "../../../apps/fleet/src/contexts/fleet/jobs/domain/events/job-status-changed.event";

class FakeEventBus implements EventBus {
  public subject: string | null = null;
  public envelope: EventEnvelope | null = null;

  async publish(subject: string, envelope: EventEnvelope) {
    this.subject = subject;
    this.envelope = envelope;
  }

  async subscribe() {
    return async () => Promise.resolve();
  }
}

describe("EventBusJobStatusEventPublisher", () => {
  it("publishes to tenant-scoped subject", async () => {
    const bus = new FakeEventBus();
    const publisher = new EventBusJobStatusEventPublisher(bus);

    const event = createJobStatusChangedEvent({
      id: "evt-1",
      occurredAt: new Date().toISOString(),
      tenantId: "tenant-a",
      jobId: "job-1",
      newStatus: "assigned",
    });

    await publisher.publish(event);

    expect(bus.subject).toBe("tm.tenant-a.job.status.changed");
    expect(bus.envelope?.type).toBe("job.status.changed");
  });
});
