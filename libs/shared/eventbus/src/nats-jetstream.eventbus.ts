import {
  AckPolicy,
  connect,
  DeliverPolicy,
  JSONCodec,
  type ConnectionOptions,
  type JetStreamClient,
  type NatsConnection,
} from "nats";
import { AppLogger } from "../../logger/src";
import type { EventBus } from "./event-bus.interface";
import type { EventEnvelope } from "./event-envelope";

/** The login a service presents to the bus. Empty connects anonymously. */
export type NatsCredentials = { user?: string; password?: string };

export function natsLogin(credentials: NatsCredentials): Pick<ConnectionOptions, "user" | "pass"> {
  return credentials.user ? { user: credentials.user, pass: credentials.password } : {};
}

function sanitizeJetStreamName(streamName: string): string {
  const normalized = streamName
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || "truckmoov_events";
}

export class NatsJetStreamEventBus implements EventBus {
  private connection: NatsConnection | null = null;
  private jetstream: JetStreamClient | null = null;
  private readonly jsonCodec = JSONCodec<EventEnvelope>();
  private readonly streamName: string;

  constructor(
    private readonly logger: AppLogger,
    private readonly natsUrl: string,
    streamName: string,
    private readonly credentials: NatsCredentials = {},
  ) {
    // JetStream stream names cannot contain "." even though event subjects do.
    this.streamName = sanitizeJetStreamName(streamName);
    if (this.streamName !== streamName) {
      this.logger.warn("Sanitized invalid JetStream stream name", {
        configuredStream: streamName,
        effectiveStream: this.streamName,
      });
    }
  }

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
    consumer?: string,
  ): Promise<() => Promise<void>> {
    const js = await this.getJetStream();
    if (!js || !this.connection) {
      this.logger.warn("Skipping subscribe because NATS is not reachable", { subject });
      return async () => Promise.resolve();
    }

    // The consumer name is part of the durable, so two subscribers to one
    // subject get one consumer each. Derived from the subject alone, they would
    // share a consumer and JetStream would give each message to exactly one of
    // them — silently, and differently on each restart.
    const durable = [subject, consumer]
      .filter(Boolean)
      .join("_")
      .replace(/[.*>]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");
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

    const jetStreamConsumer = await js.consumers.get(this.streamName, durable);
    const sub = await jetStreamConsumer.consume();

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

  async subscribeEveryInstance(
    subject: string,
    handler: (envelope: EventEnvelope) => Promise<void>,
  ): Promise<() => Promise<void>> {
    await this.getJetStream();
    if (!this.connection) {
      this.logger.warn("Skipping subscribe because NATS is not reachable", { subject });
      return async () => Promise.resolve();
    }
    const sub = this.connection.subscribe(subject);
    (async () => {
      for await (const msg of sub) {
        try {
          await handler(this.jsonCodec.decode(msg.data));
        } catch (err) {
          this.logger.warn("event_handler_failed", { subject, error: (err as Error).message });
        }
      }
    })();
    return async () => sub.unsubscribe();
  }

  async isReady(): Promise<boolean> {
    try {
      const js = await this.getJetStream();
      return !!js && !!this.connection && !this.connection.isClosed();
    } catch {
      return false;
    }
  }

  private async getJetStream(): Promise<JetStreamClient | null> {
    if (this.jetstream) {
      return this.jetstream;
    }

    try {
      this.connection = await connect({ servers: this.natsUrl, ...natsLogin(this.credentials) });
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
