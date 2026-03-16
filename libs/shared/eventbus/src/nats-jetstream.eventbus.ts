import { AckPolicy, connect, DeliverPolicy, JSONCodec, type JetStreamClient, type NatsConnection } from "nats";
import { AppLogger } from "../../logger/src";
import type { EventBus } from "./event-bus.interface";
import type { EventEnvelope } from "./event-envelope";

export class NatsJetStreamEventBus implements EventBus {
  private connection: NatsConnection | null = null;
  private jetstream: JetStreamClient | null = null;
  private readonly jsonCodec = JSONCodec<EventEnvelope>();

  constructor(
    private readonly logger: AppLogger,
    private readonly natsUrl: string,
    private readonly streamName: string,
  ) {}

  async publish<TData extends Record<string, unknown>>(
    subject: string,
    envelope: EventEnvelope<TData>,
  ): Promise<void> {
    const js = await this.getJetStream();
    if (!js) {
      this.logger.warn("Skipping publish because NATS is not reachable", {
        subject,
      });
      return;
    }

    await js.publish(subject, this.jsonCodec.encode(envelope));
  }

  async subscribe(
    subject: string,
    handler: (envelope: EventEnvelope) => Promise<void>,
  ): Promise<() => Promise<void>> {
    const js = await this.getJetStream();
    if (!js || !this.connection) {
      this.logger.warn("Skipping subscribe because NATS is not reachable", { subject });
      return async () => Promise.resolve();
    }

    const durable = subject.replace(/[.*>]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
    const manager = await this.connection.jetstreamManager();

    try {
      await manager.consumers.info(this.streamName, durable);
    } catch {
      await manager.consumers.add(this.streamName, {
        durable_name: durable,
        filter_subject: subject,
        ack_policy: AckPolicy.Explicit,
        deliver_policy: DeliverPolicy.New,
      });
    }

    const consumer = await js.consumers.get(this.streamName, durable);
    const sub = await consumer.consume();

    (async () => {
      for await (const msg of sub) {
        try {
          const envelope = this.jsonCodec.decode(msg.data);
          await handler(envelope);
          msg.ack();
        } catch (err) {
          this.logger.warn("event_handler_failed", { subject, error: (err as Error).message });
          msg.nak();
        }
      }
    })();

    return async () => sub.stop();
  }

  private async getJetStream(): Promise<JetStreamClient | null> {
    if (this.jetstream) {
      return this.jetstream;
    }

    try {
      this.connection = await connect({ servers: this.natsUrl });
      this.jetstream = this.connection.jetstream();
      await this.ensureStream();
      this.logger.log("Connected to NATS JetStream", {
        natsUrl: this.natsUrl,
        stream: this.streamName,
      });
      return this.jetstream;
    } catch (error) {
      this.logger.warn("NATS connection failed", {
        error: (error as Error).message,
      });
      return null;
    }
  }

  private async ensureStream() {
    if (!this.connection) {
      return;
    }

    const manager = await this.connection.jetstreamManager();
    try {
      await manager.streams.info(this.streamName);
    } catch {
      await manager.streams.add({
        name: this.streamName,
        subjects: ["tm.*.>"]
      });
    }
  }
}
