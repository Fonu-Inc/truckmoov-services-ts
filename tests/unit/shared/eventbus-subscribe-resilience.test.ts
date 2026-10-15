import { beforeEach, describe, expect, it, vi } from "vitest";
import { JSONCodec } from "nats";
import { NatsJetStreamEventBus } from "../../../libs/shared/eventbus/src/nats-jetstream.eventbus";

type FakeMsg = { data: Uint8Array; subject: string; info: { redeliveryCount: number }; ack: () => void; nak: (d?: number) => void; term: () => void };

const nats = vi.hoisted(() => ({ reachable: true, connects: 0, messages: [] as unknown[] }));

vi.mock("nats", async (importOriginal) => {
  const original = await importOriginal<typeof import("nats")>();
  const consumer = {
    consume: async () => ({
      async *[Symbol.asyncIterator]() {
        yield* nats.messages;
      },
      stop: async () => undefined,
    }),
  };
  const connection = {
    jetstream: () => ({ consumers: { get: async () => consumer } }),
    jetstreamManager: async () => ({ streams: { info: async () => ({}) }, consumers: { info: async () => ({}) } }),
    isClosed: () => false,
  };
  return {
    ...original,
    connect: vi.fn(async () => {
      nats.connects += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (!nats.reachable) throw new Error("ECONNREFUSED");
      return connection;
    }),
  };
});

const logger = () => ({ warn: vi.fn(), log: vi.fn() }) as never;

function message(redeliveryCount: number): FakeMsg {
  return {
    data: JSONCodec().encode({ id: "e1", type: "t", version: 1, occurred_at: "", tenant_id: "a", data: {} }),
    subject: "tm.a.t",
    info: { redeliveryCount },
    ack: vi.fn(),
    nak: vi.fn(),
    term: vi.fn(),
  };
}

describe("NatsJetStreamEventBus subscribe", () => {
  beforeEach(() => {
    nats.reachable = true;
    nats.connects = 0;
    nats.messages = [];
  });

  it("fails the subscribe when NATS is unreachable", async () => {
    nats.reachable = false;
    const bus = new NatsJetStreamEventBus(logger(), "nats://x", "s");

    await expect(bus.subscribe("tm.*.t", async () => undefined)).rejects.toThrow(/not reachable/);
  });

  it("stays a no-op when NATS is optional", async () => {
    nats.reachable = false;
    const bus = new NatsJetStreamEventBus(logger(), "nats://x", "s", {}, { optional: true });

    await expect(bus.subscribe("tm.*.t", async () => undefined)).resolves.toBeTypeOf("function");
  });

  it("connects once for concurrent callers", async () => {
    const bus = new NatsJetStreamEventBus(logger(), "nats://x", "s");

    await Promise.all([bus.isReady(), bus.isReady(), bus.isReady()]);

    expect(nats.connects).toBe(1);
  });

  it("naks a failed message with a delay and terminates it after the delivery cap", async () => {
    const fresh = message(1);
    const exhausted = message(10);
    nats.messages = [fresh, exhausted];
    const bus = new NatsJetStreamEventBus(logger(), "nats://x", "s");

    await bus.subscribe("tm.*.t", async () => {
      throw new Error("boom");
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fresh.nak).toHaveBeenCalledWith(5_000);
    expect(fresh.term).not.toHaveBeenCalled();
    expect(exhausted.term).toHaveBeenCalled();
    expect(exhausted.nak).not.toHaveBeenCalled();
  });
});
