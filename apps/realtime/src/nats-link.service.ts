import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { connect, type NatsConnection, type Subscription } from 'nats';
import { AppConfigService } from '@shared/config';
import { natsLogin, type EventBus, type EventEnvelope } from '@shared/eventbus';

type EnvelopeHandler = (envelope: EventEnvelope, meta: { subject: string }) => Promise<void> | void;

/**
 * The one core NATS connection of this service. Core, not JetStream: every pod
 * must see every message, and the stream still stores what is published.
 */
@Injectable()
export class NatsLink implements OnApplicationShutdown {
  private readonly logger = new Logger(NatsLink.name);
  private connecting: Promise<NatsConnection> | null = null;
  private connection: NatsConnection | null = null;
  private up = false;
  private readonly subscriptions: Subscription[] = [];
  private readonly fanouts = new Map<string, EnvelopeHandler[]>();

  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  connectOnce(): Promise<NatsConnection> {
    this.connecting ??= connect({
      servers: this.config.nats.url,
      ...natsLogin(this.config.nats),
      maxReconnectAttempts: -1,
      reconnectTimeWait: 2_000,
    }).then(
      (connection) => {
        this.connection = connection;
        this.up = true;
        this.watch(connection);
        return connection;
      },
      (error: unknown) => {
        this.connecting = null;
        throw error;
      },
    );
    return this.connecting;
  }

  isUp(): boolean {
    return this.up && !!this.connection && !this.connection.isClosed();
  }

  async publish(subject: string, payload: unknown): Promise<void> {
    const connection = await this.connectOnce();
    connection.publish(subject, JSON.stringify(payload));
    await connection.flush();
  }

  async subscribe(subject: string, handler: (subject: string, body: unknown) => void): Promise<void> {
    const subscription = (await this.connectOnce()).subscribe(subject);
    this.subscriptions.push(subscription);
    void this.pump(subscription, handler);
  }

  /**
   * Enough of the event bus for callers that only need broadcast delivery.
   * Handlers of one subject run in registration order, one at a time.
   */
  asBroadcastBus(): EventBus {
    const bus = {
      subscribeEveryInstance: async (subject: string, handler: EnvelopeHandler) => {
        const handlers = this.fanouts.get(subject);
        if (handlers) {
          handlers.push(handler);
        } else {
          this.fanouts.set(subject, [handler]);
          await this.subscribe(subject, (name, body) => void this.runFanout(subject, name, body));
        }
        return async () => {
          const list = this.fanouts.get(subject) ?? [];
          this.fanouts.set(subject, list.filter((item) => item !== handler));
        };
      },
    };
    return bus as unknown as EventBus;
  }

  async onApplicationShutdown(): Promise<void> {
    for (const subscription of this.subscriptions) subscription.unsubscribe();
    await this.connection?.drain().catch(() => {});
    this.connection = null;
  }

  private async runFanout(subject: string, name: string, body: unknown): Promise<void> {
    for (const handler of this.fanouts.get(subject) ?? []) {
      try {
        await handler(body as EventEnvelope, { subject: name });
      } catch (error) {
        this.logger.warn(`nats_fanout_handler_failed:${name}:${error instanceof Error ? error.message : 'unknown'}`);
      }
    }
  }

  private async pump(subscription: Subscription, handler: (subject: string, body: unknown) => void): Promise<void> {
    for await (const message of subscription) {
      try {
        handler(message.subject, message.json());
      } catch (error) {
        this.logger.warn(`nats_bad_message:${message.subject}:${error instanceof Error ? error.message : 'unknown'}`);
      }
    }
  }

  private watch(connection: NatsConnection): void {
    void (async () => {
      for await (const status of connection.status()) {
        if (status.type === 'disconnect' || status.type === 'error') this.logger.warn(`nats_link_${status.type}`);
        if (status.type === 'disconnect') this.up = false;
        if (status.type === 'reconnect') {
          this.up = true;
          this.logger.log('nats_link_reconnected');
        }
      }
    })();
  }
}
