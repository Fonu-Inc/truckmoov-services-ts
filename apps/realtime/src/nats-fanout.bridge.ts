import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { SYSTEM_TENANT_ID } from '@shared/identity';
import { NatsLink } from './nats-link.service';
import { PositionCoalescer, readPosition } from './position-coalescer';
import { RealtimeGateway } from './realtime.gateway';
import { tenantOfSubject } from './tenant-subject';

/**
 * Subjects this gateway forwards to browsers. Narrow on purpose: an event is
 * pushed to a tenant's UI only if someone decided it should be.
 */
const FORWARDED_SUBJECTS = [
  'tm.*.mailbox.updated',
  'tm.*.tenant.suspended',
  'tm.*.tenant.reinstated',
  // Live Tracking. Positions are coalesced into one frame per tick rather than
  // forwarded one by one; the rest pass straight through because they are rare
  // and each one matters on its own.
  'tm.*.vehicle.location.updated',
  'tm.*.tracking.counts',
  'tm.*.alert.triggered',
] as const;

const SUSPENDED_EVENT = 'tenant.suspended';
const REINSTATED_EVENT = 'tenant.reinstated';

/** Forwarded as a batched frame, not per message. */
const COALESCED_SUBJECT_EVENT = 'vehicle.location.updated';

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
  private readonly coalescer = new PositionCoalescer();
  private frameTimer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(RealtimeGateway) private readonly gateway: RealtimeGateway,
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(NatsLink) private readonly link: NatsLink,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      for (const subject of FORWARDED_SUBJECTS) {
        await this.link.subscribe(subject, (name, body) => this.forward(name, body));
      }
      this.startFrameTimer();
      this.logger.log(`nats_fanout_ready:${FORWARDED_SUBJECTS.length} subjects`);
    } catch (error) {
      this.logger.error(
        `nats_fanout_connect_failed:${error instanceof Error ? error.message : 'unknown'}`,
      );
      throw error;
    }
  }

  onApplicationShutdown(): void {
    if (this.frameTimer) clearInterval(this.frameTimer);
    this.frameTimer = null;
  }

  private forward(subject: string, envelope: unknown): void {
    const tenantId = tenantOfSubject(subject);
    // No tenant in the subject, or a platform-wide event: it belongs to no
    // tenant's room, so it is dropped rather than broadcast.
    if (!tenantId || tenantId === SYSTEM_TENANT_ID) return;

    const event = subject.split('.').slice(2).join('.');
    const data = envelope as { data?: unknown } | null;

    if (event === COALESCED_SUBJECT_EVENT) {
      const position = readPosition(data?.data);
      // A fix with no vehicle or no coordinates cannot be drawn. Dropped here
      // rather than sent for the browser to filter out.
      if (position) this.coalescer.add(tenantId, position);
      return;
    }

    // Only the event name and its payload cross to the browser. The subject is
    // rebuilt client-side from the event, so a tenant never sees another
    // tenant's identifier even in a routing field.
    this.gateway.emitToTenant(tenantId, event, data?.data ?? {});
    if (event === SUSPENDED_EVENT) this.gateway.disconnectTenant(tenantId);
    if (event === REINSTATED_EVENT) this.gateway.reinstateTenant(tenantId);
  }

  /**
   * One frame per tenant per tick, holding only the newest fix per vehicle.
   *
   * The timer runs whether or not anything arrived; an empty buffer costs a
   * map lookup. Draining on a schedule rather than on message arrival is what
   * keeps a busy fleet from setting the pace for every connected browser.
   */
  private startFrameTimer(): void {
    const interval = this.config.liveTracking.frameIntervalMs;
    this.frameTimer = setInterval(() => this.flushFrames(), interval);
    this.frameTimer.unref?.();
  }

  private flushFrames(): void {
    for (const { tenantId, positions } of this.coalescer.drain()) {
      if (positions.length === 0) continue;
      this.gateway.emitToTenant(tenantId, 'tracking.positions', { positions });
    }
  }
}
