import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { connect, type NatsConnection, type Subscription } from 'nats';
import { AppConfigService } from '@shared/config';
import { RealtimeGateway } from './realtime.gateway';
import { tenantOfSubject, SYSTEM_TENANT } from './tenant-subject';

/**
 * Subjects this gateway forwards to browsers. Narrow on purpose: an event is
 * pushed to a tenant's UI only if someone decided it should be.
 */
const FORWARDED_SUBJECTS = [
  'tm.*.mailbox.updated',
  'tm.*.tenant.suspended',
  'tm.*.tenant.reinstated',
] as const;

/**
 * Carries events from NATS to connected browsers.
 *
 * Uses CORE NATS, not the shared JetStream EventBus. The EventBus derives a
 * durable consumer per subject, so every replica of this gateway would bind the
 * same consumer and JetStream would give each message to exactly one pod —
 * queue semantics. Fan-out is the opposite: every pod must see every message,
 * because the client it belongs to may be connected to any of them.
 *
 * Core NATS is at-most-once, which is correct here. A message missed while a
 * client was away is not recovered over the socket; the client refetches with
 * its cursor on reconnect. The socket removes latency, not the need to refetch.
 */
@Injectable()
export class NatsFanoutBridge implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(NatsFanoutBridge.name);
  private connection: NatsConnection | null = null;
  private readonly subscriptions: Subscription[] = [];

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(RealtimeGateway) private readonly gateway: RealtimeGateway,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      this.connection = await connect({
        servers: this.config.nats.url,
        // Reconnects forever. A dropped link would otherwise leave the gateway
        // holding sockets it can never deliver anything to, which looks healthy
        // from outside and is not.
        maxReconnectAttempts: -1,
        reconnectTimeWait: 2_000,
      });
      this.watchConnection();

      for (const subject of FORWARDED_SUBJECTS) {
        this.subscribe(subject);
      }
      this.logger.log(`nats_fanout_ready:${FORWARDED_SUBJECTS.length} subjects`);
    } catch (error) {
      this.logger.error(
        `nats_fanout_connect_failed:${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    for (const subscription of this.subscriptions) subscription.unsubscribe();
    await this.connection?.drain().catch(() => {});
    this.connection = null;
  }

  private subscribe(subject: string): void {
    if (!this.connection) return;

    const subscription = this.connection.subscribe(subject);
    this.subscriptions.push(subscription);

    void (async () => {
      for await (const message of subscription) {
        try {
          this.forward(message.subject, message.json());
        } catch (error) {
          this.logger.warn(
            `nats_fanout_bad_message:${message.subject}:${error instanceof Error ? error.message : 'unknown'}`,
          );
        }
      }
    })();
  }

  private forward(subject: string, envelope: unknown): void {
    const tenantId = tenantOfSubject(subject);
    // No tenant in the subject, or a platform-wide event: it belongs to no
    // tenant's room, so it is dropped rather than broadcast.
    if (!tenantId || tenantId === SYSTEM_TENANT) return;

    const event = subject.split('.').slice(2).join('.');
    const data = envelope as { data?: unknown } | null;

    // Only the event name and its payload cross to the browser. The subject is
    // rebuilt client-side from the event, so a tenant never sees another
    // tenant's identifier even in a routing field.
    this.gateway.emitToTenant(tenantId, event, data?.data ?? {});
  }

  private watchConnection(): void {
    if (!this.connection) return;

    void (async () => {
      for await (const status of this.connection!.status()) {
        if (status.type === 'disconnect' || status.type === 'error') {
          this.logger.warn(`nats_fanout_${status.type}`);
        }
        if (status.type === 'reconnect') {
          this.logger.log('nats_fanout_reconnected');
        }
      }
    })();
  }
}
