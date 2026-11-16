import { describe, expect, it } from "vitest";
import { signBusEvent, type BusHandler, type EventEnvelope } from "@shared/eventbus";
import { ActivityLogListener } from "../../../apps/auth/src/activity-log.listener";

const SECRET = "bus-secret";

async function setup() {
  const handlers = new Map<string, BusHandler>();
  const bus = {
    subscribe: async (subject: string, handler: BusHandler) => {
      handlers.set(subject, handler);
      return async () => {};
    },
  } as never;
  const recorded: { tenantId: string }[] = [];
  const activityLog = { record: async (entry: { tenantId: string }) => void recorded.push(entry) } as never;
  const config = { eventSigningSecret: SECRET, eventAcceptUnsigned: false } as never;
  await new ActivityLogListener(bus, activityLog, config).onApplicationBootstrap();
  const emit = (subject: string, envelope: EventEnvelope) => handlers.get("tm.*.activity.logged")!(envelope, { subject });
  return { recorded, emit };
}

const envelope = (tenantId: string): EventEnvelope => ({
  id: "evt-1",
  type: "activity.logged",
  version: 1,
  occurred_at: new Date().toISOString(),
  tenant_id: tenantId,
  data: { service: "fleet", action: "vehicle.created", entity_type: "vehicle", entity_id: "v1", summary: "Created" },
});

describe("ActivityLogListener", () => {
  it("records a signed event for the subject's tenant", async () => {
    const { recorded, emit } = await setup();
    const subject = "tm.tenant-a.activity.logged";
    await emit(subject, signBusEvent(SECRET, subject, envelope("tenant-a")));
    expect(recorded.map((r) => r.tenantId)).toEqual(["tenant-a"]);
  });

  it("drops an unsigned event", async () => {
    const { recorded, emit } = await setup();
    await emit("tm.tenant-a.activity.logged", envelope("tenant-a"));
    expect(recorded).toHaveLength(0);
  });

  it("drops an envelope naming a tenant other than the subject's", async () => {
    const { recorded, emit } = await setup();
    const subject = "tm.tenant-a.activity.logged";
    await emit(subject, signBusEvent(SECRET, subject, envelope("tenant-b")));
    expect(recorded).toHaveLength(0);
  });
});
