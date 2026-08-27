import { Inject, Injectable, Logger } from '@nestjs/common';
import { EVENT_BUS, type EventBus } from '@shared/eventbus';

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

  constructor(@Inject(EVENT_BUS) private readonly bus: EventBus) {}

  async notifyReplied(tenantId: string, ticketId: string): Promise<void> {
    await this.publish(tenantId, 'support_ticket.replied', { ticket_id: ticketId });
  }

  async notifyStatusChanged(tenantId: string, ticketId: string, status: string): Promise<void> {
    await this.publish(tenantId, 'support_ticket.status_changed', {
      ticket_id: ticketId,
      status,
    });
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
