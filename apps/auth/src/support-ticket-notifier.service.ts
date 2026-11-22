import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { EVENT_BUS, type EventBus } from '@shared/eventbus';
import { USER_REPOSITORY } from './contexts/auth/session';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { SUPPORT_TICKET_REPOSITORY, ticketDisplayId, type SupportTicketRepository } from './support-ticket.repository';
import { TenantNotificationPublisher } from './tenant-notification.publisher';

/** Socket event names the realtime gateway forwards to the tenant room as-is. */
export const SUPPORT_TICKET_EVENTS = {
  raised: 'support_ticket.raised',
  replied: 'support_ticket.replied',
  customerReplied: 'support_ticket.customer_replied',
  statusChanged: 'support_ticket.status_changed',
} as const;

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In progress',
  waiting_on_tenant: 'Waiting on you',
  escalated: 'Escalated',
  resolved: 'Resolved',
  closed: 'Closed',
};

/**
 * Tells a tenant when their ticket changes on the platform side.
 *
 * The admin screens already let staff reply and change status; what was
 * missing is the tenant ever finding out. A ticket update nobody sees is
 * useless — this is the wiring that closes that gap.
 */
@Injectable()
export class SupportTicketNotifierService {
  private readonly logger = new Logger(SupportTicketNotifierService.name);

  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    @Optional() @Inject(SUPPORT_TICKET_REPOSITORY) private readonly tickets?: SupportTicketRepository,
    @Optional() @Inject(USER_REPOSITORY) private readonly users?: UserRepository,
    @Optional() @Inject(TenantNotificationPublisher) private readonly email?: TenantNotificationPublisher,
  ) {}

  async notifyRaised(tenantId: string, ticketId: string, data: Record<string, unknown> = {}): Promise<void> {
    await this.publish(tenantId, SUPPORT_TICKET_EVENTS.raised, { ...data, ...ids(ticketId) });
  }

  /** Support answered: the tenant room refreshes and the reporter is emailed. */
  async notifyReplied(tenantId: string, ticketId: string): Promise<void> {
    await this.publish(tenantId, SUPPORT_TICKET_EVENTS.replied, ids(ticketId));
    await this.emailReporter(ticketId, (ref) => `Support replied to your ticket ${ref}.`);
  }

  /** Support moved the ticket: the tenant room refreshes and the reporter is emailed. */
  async notifyStatusChanged(tenantId: string, ticketId: string, status: string): Promise<void> {
    await this.publish(tenantId, SUPPORT_TICKET_EVENTS.statusChanged, { ...ids(ticketId), status });
    await this.emailReporter(
      ticketId,
      (ref) => `Your ticket ${ref} is now ${STATUS_LABELS[status] ?? status}.`,
    );
  }

  /** The tenant's own reply: other screens of the account refresh and the platform side can react. */
  async notifyCustomerReplied(tenantId: string, ticketId: string, status: string): Promise<void> {
    await this.publish(tenantId, SUPPORT_TICKET_EVENTS.customerReplied, { ...ids(ticketId), status });
  }

  /** The tenant closed or reopened it themselves, so nobody is emailed about their own action. */
  async notifyCustomerStatusChanged(tenantId: string, ticketId: string, status: string): Promise<void> {
    await this.publish(tenantId, SUPPORT_TICKET_EVENTS.statusChanged, { ...ids(ticketId), status });
  }

  private async emailReporter(ticketId: string, line: (ref: string) => string): Promise<void> {
    if (!this.tickets || !this.users || !this.email) return;
    try {
      const ticket = await this.tickets.findById(ticketId);
      if (!ticket || ticket.reporterType !== 'tenant_user') return;
      const reporter = await this.users.findById(ticket.createdBy);
      if (!reporter?.email) return;
      const ref = ticketDisplayId(ticket.ticketNumber);
      await this.email.notify({
        tenantId: ticket.tenantId,
        recipient: reporter.email,
        channel: 'email',
        notificationType: 'support_ticket_update',
        content: `${line(ref)}\n\n${ticket.subject}\n\nOpen Ticketing & Support in TruckMoov to see the details.`,
      });
    } catch (error) {
      this.logger.warn(
        `support_ticket_email_failed:${ticketId}:${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  private async publish(tenantId: string, type: string, data: Record<string, unknown>): Promise<void> {
    try {
      await this.bus.publish(`tm.${tenantId}.${type}`, {
        id: crypto.randomUUID(),
        type,
        version: 1,
        occurred_at: new Date().toISOString(),
        tenant_id: tenantId,
        data,
      });
    } catch (error) {
      // The change already happened and is saved either way; a missed
      // notification means the tenant finds out by refreshing instead of
      // being told, which is worse than losing the update outright.
      this.logger.warn(
        `support_ticket_notify_failed:${tenantId}:${data.ticket_id}:${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }
}

/** snake_case for bus consumers, camelCase for the browser. */
function ids(ticketId: string) {
  return { ticket_id: ticketId, ticketId };
}
