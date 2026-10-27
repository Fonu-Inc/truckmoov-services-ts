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
import { signBusEvent, type BusHandler } from "./bus-signature";
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

/** `optional`: outside production, subscribing without a bus is a no-op instead of a boot failure. */
export type NatsBusOptions = { signingSecret?: string; optional?: boolean };

const MAX_DELIVERIES = 10;
const REDELIVERY_DELAY_MS = 5_000;
const NO_UNSUBSCRIBE = async () => Promise.resolve();

export class NatsJetStreamEventBus implements EventBus {
  private connection: NatsConnection | null = null;
  private connecting: Promise<JetStreamClient | null> | null = null;
  private readonly jsonCodec = JSONCodec<EventEnvelope>();
  private readonly streamName: string;
  private warnedUnsigned = false;

  constructor(
    private readonly logger: AppLogger,
    private readonly natsUrl: string,
    streamName: string,
    private readonly credentials: NatsCredentials = {},
    private readonly options: NatsBusOptions = {},
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

    await js.publish(subject, this.jsonCodec.encode(this.sign(subject, envelope)));
  }

  private sign(subject: string, envelope: EventEnvelope): EventEnvelope {
    const { bsig: _ignored, ...unsigned } = envelope;
    const secret = this.options.signingSecret;
    if (!secret) {
      if (!this.warnedUnsigned) {
        this.warnedUnsigned = true;
        this.logger.warn("event_signing_secret_unset: publishing unsigned events");
      }
      return unsigned;
    }
    try {
      return signBusEvent(secret, subject, unsigned);
    } catch {
      this.logger.warn(`event_unsignable:${envelope.type}`);
      return unsigned;
    }
  }

  async subscribe(
    subject: string,
    handler: BusHandler,
    consumer?: string,
  ): Promise<() => Promise<void>> {
    const js = await this.getJetStream();
    if (!js || !this.connection) return this.unreachable(subject);

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
          await handler(envelope, { subject: msg.subject });
          msg.ack();
        } catch (err) {
          this.logger.warn("event_handler_failed", { subject, error: (err as Error).message });
          if (msg.info.redeliveryCount >= MAX_DELIVERIES) msg.term();
          else msg.nak(REDELIVERY_DELAY_MS);
        }
      }
    })();

    return async () => sub.stop();
  }

  async subscribeEveryInstance(
    subject: string,
    handler: BusHandler,
  ): Promise<() => Promise<void>> {
    await this.getJetStream();
    if (!this.connection) return this.unreachable(subject);
    const sub = this.connection.subscribe(subject);
    (async () => {
      for await (const msg of sub) {
        try {
          await handler(this.jsonCodec.decode(msg.data), { subject: msg.subject });
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

  /** A subscriber that silently gets nothing is worse than a pod that restarts until NATS is back. */
  private unreachable(subject: string): () => Promise<void> {
    if (!this.options.optional) throw new Error(`NATS is not reachable; cannot subscribe to ${subject}`);
    this.logger.warn("Skipping subscribe because NATS is not reachable", { subject });
    return NO_UNSUBSCRIBE;
  }

  private getJetStream(): Promise<JetStreamClient | null> {
    this.connecting ??= this.connect().then((js) => {
      if (!js) this.connecting = null;
      return js;
    });
    return this.connecting;
  }

  private async connect(): Promise<JetStreamClient | null> {
    try {
      this.connection = await connect({
        servers: this.natsUrl,
        ...natsLogin(this.credentials),
        maxReconnectAttempts: -1,
        reconnectTimeWait: 2_000,
        // A required bus waits for NATS at startup; an optional one (dev, tests) fails fast and runs without it.
        waitOnFirstConnect: !this.options.optional,
      });
      const jetstream = this.connection.jetstream();
      await this.ensureStream();
      this.logger.log("Connected to NATS JetStream", {
        natsUrl: this.natsUrl,
        stream: this.streamName,
      });
      return jetstream;
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
