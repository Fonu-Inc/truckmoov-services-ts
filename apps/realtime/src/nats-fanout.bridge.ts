import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { verifyBusEvent, type EventEnvelope } from '@shared/eventbus';
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
  // Only for owner operators limited to their own vehicles; never sent to the tenant room.
  'tm.*.tracking.owner_counts',
  'tm.*.vehicle.owner.assigned',
  // Support ticket changes: raised, replied, customer_replied, status_changed.
  'tm.*.support_ticket.*',
] as const;

const SUSPENDED_EVENT = 'tenant.suspended';
const REINSTATED_EVENT = 'tenant.reinstated';
/** The only per-vehicle event besides positions; counts and mailbox stay whole-tenant. */
const ALERT_EVENT = 'alert.triggered';
const MAILBOX_EVENT = 'mailbox.updated';
const OWNER_COUNTS_EVENT = 'tracking.owner_counts';
const OWNER_ASSIGNED_EVENT = 'vehicle.owner.assigned';
const SUPPORT_TICKET_PREFIX = 'support_ticket.';

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
    if (!this.config.eventSigningSecret) this.logger.error('event_signing_secret_unset');
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
    if (typeof envelope !== 'object' || envelope === null) return;

    const verdict = verifyBusEvent(this.config.eventSigningSecret, subject, envelope as EventEnvelope, {
      acceptUnsigned: this.config.eventAcceptUnsigned,
    });
    if (!verdict.ok) {
      this.logger.warn(`event_rejected:${subject}:${verdict.reason}`);
      return;
    }
    if (!verdict.signed) this.logger.warn(`event_unsigned_accepted:${subject}`);

    const event = subject.split('.').slice(2).join('.');
    const data = envelope as { data?: unknown };

    if (event === COALESCED_SUBJECT_EVENT) {
      const position = readPosition(data?.data);
      // A fix with no vehicle or no coordinates cannot be drawn. Dropped here
      // rather than sent for the browser to filter out.
      if (position) this.coalescer.add(tenantId, position);
      return;
    }

    if (event === OWNER_COUNTS_EVENT || event === OWNER_ASSIGNED_EVENT) {
      this.forwardToOwner(tenantId, event, data?.data);
      return;
    }

    // Only the event name and its payload cross to the browser. The subject is
    // rebuilt client-side from the event, so a tenant never sees another
    // tenant's identifier even in a routing field.
    this.gateway.emitToTenant(tenantId, event, data?.data ?? {});
    const vehicleId = (data?.data as { vehicle_id?: unknown } | undefined)?.vehicle_id;
    if (event === ALERT_EVENT && typeof vehicleId === 'string' && this.gateway.hasScopedSockets(tenantId)) {
      this.gateway.emitToVehicle(tenantId, vehicleId, event, data?.data ?? {});
    }
    // The mailbox and support tickets are the organisation's, and REST lets a limited owner operator read both.
    const organisationWide = event === MAILBOX_EVENT || event.startsWith(SUPPORT_TICKET_PREFIX);
    if (organisationWide && this.gateway.hasScopedSockets(tenantId)) {
      this.gateway.emitToScoped(tenantId, event, data?.data ?? {});
    }
    if (event === SUSPENDED_EVENT) this.gateway.disconnectTenant(tenantId);
    if (event === REINSTATED_EVENT) this.gateway.reinstateTenant(tenantId);
  }

  private forwardToOwner(tenantId: string, event: string, payload: unknown): void {
    if (!this.gateway.hasScopedSockets(tenantId) || typeof payload !== 'object' || payload === null) return;
    const body = payload as { owner_operator_id?: unknown; counts?: unknown; vehicle_ids?: unknown };
    if (typeof body.owner_operator_id !== 'string') return;
    if (event === OWNER_COUNTS_EVENT && body.counts && typeof body.counts === 'object') {
      this.gateway.emitToOwner(tenantId, body.owner_operator_id, 'tracking.counts', body.counts);
    }
    if (event === OWNER_ASSIGNED_EVENT && Array.isArray(body.vehicle_ids)) {
      const ids = body.vehicle_ids.filter((id): id is string => typeof id === 'string');
      this.gateway.addOwnedVehicles(tenantId, body.owner_operator_id, ids);
    }
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
      if (!this.gateway.hasScopedSockets(tenantId)) continue;
      for (const position of positions) {
        this.gateway.emitToVehicle(tenantId, position.vehicleId, 'tracking.positions', { positions: [position] });
      }
    }
  }
}
