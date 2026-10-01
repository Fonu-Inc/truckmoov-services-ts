import { beforeEach, describe, expect, it, vi } from "vitest";
import { JSONCodec } from "nats";
import { verifyBusEvent, type EventEnvelope } from "@shared/eventbus";
import { NatsJetStreamEventBus } from "../../../libs/shared/eventbus/src/nats-jetstream.eventbus";

const published: Array<{ subject: string; data: Uint8Array }> = [];

vi.mock("nats", async (importOriginal) => {
  const original = await importOriginal<typeof import("nats")>();
  const jetstream = { publish: vi.fn(async (subject: string, data: Uint8Array) => void published.push({ subject, data })) };
  const connection = {
    jetstream: () => jetstream,
    jetstreamManager: async () => ({ streams: { info: async () => ({}) } }),
    isClosed: () => false,
  };
  return { ...original, connect: vi.fn(async () => connection) };
});

const SECRET = "bus-secret";
const codec = JSONCodec<EventEnvelope>();

function logger() {
  return { warn: vi.fn(), log: vi.fn() } as never;
}

function envelope(data: Record<string, unknown>): EventEnvelope {
  return { id: "e1", type: "tenant.suspended", version: 1, occurred_at: "2026-10-01T00:00:00Z", tenant_id: "acme", data };
}

function lastPublished(): EventEnvelope {
  return codec.decode(published[published.length - 1].data);
}

describe("NatsJetStreamEventBus publish signing", () => {
  beforeEach(() => {
    published.length = 0;
  });

  it("signs what it publishes", async () => {
    const bus = new NatsJetStreamEventBus(logger(), "nats://x", "s", {}, { signingSecret: SECRET });
    await bus.publish("tm.acme.tenant.suspended", envelope({ reason: "billing" }));
    expect(verifyBusEvent(SECRET, "tm.acme.tenant.suspended", lastPublished())).toEqual({ ok: true, signed: true });
  });

  it("recomputes a caller-supplied bsig", async () => {
    const bus = new NatsJetStreamEventBus(logger(), "nats://x", "s", {}, { signingSecret: SECRET });
    await bus.publish("tm.acme.tenant.suspended", { ...envelope({}), bsig: "forged" });
    expect(verifyBusEvent(SECRET, "tm.acme.tenant.suspended", lastPublished()).ok).toBe(true);
  });

  it("publishes unsigned and logs once when the event cannot be canonicalised", async () => {
    const log = logger();
    const bus = new NatsJetStreamEventBus(log, "nats://x", "s", {}, { signingSecret: SECRET });
    await bus.publish("tm.acme.tenant.suspended", envelope({ ratio: 1e-7 }));
    expect(lastPublished().bsig).toBeUndefined();
    expect((log as unknown as { warn: ReturnType<typeof vi.fn> }).warn).toHaveBeenCalledWith("event_unsignable:tenant.suspended");
  });

  it("publishes unsigned and strips any bsig when no secret is configured", async () => {
    const bus = new NatsJetStreamEventBus(logger(), "nats://x", "s");
    await bus.publish("tm.acme.tenant.suspended", { ...envelope({}), bsig: "forged" });
    expect(lastPublished().bsig).toBeUndefined();
  });
});
