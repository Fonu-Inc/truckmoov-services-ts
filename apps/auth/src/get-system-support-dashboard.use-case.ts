import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import { SUPPORT_TICKET_REPOSITORY, type SupportTicketRepository } from './support-ticket.repository';
import {
  SUPPORT_MESSAGE_REPOSITORY,
  type SupportMessageRepository,
} from './support-message.repository';
import { buildDashboardMetrics } from './support-dashboard-metrics';

@Injectable()
export class GetSystemSupportDashboardUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SUPPORT_TICKET_REPOSITORY) private readonly ticketRepo: SupportTicketRepository,
    @Inject(SUPPORT_MESSAGE_REPOSITORY) private readonly messageRepo: SupportMessageRepository,
  ) {}

  async execute(accessToken: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to view the support dashboard',
    });

    const [byStatus, byCategory, resolvedToday, byTenant, openTickets, escalatedTickets, resolvedTickets] =
      await Promise.all([
        this.ticketRepo.countByStatus(),
        this.ticketRepo.countByCategory(),
        this.ticketRepo.countResolvedToday(),
        this.ticketRepo.countByTenant(),
        this.ticketRepo.findAll({ status: 'open' }),
        this.ticketRepo.findAll({ status: 'escalated' }),
        this.ticketRepo.findAll({ status: 'resolved' }),
      ]);

    // The rate cards need every ticket, not one status at a time: an average
    // resolution time computed from the resolved bucket alone would be right,
    // but SLA breach and first-response backlog span four statuses each.
    const allTickets = await this.ticketRepo.findAll();
    const messagesByTicketId = new Map(
      await Promise.all(
        allTickets.map(
          async (ticket) =>
            [ticket.id, await this.messageRepo.findByTicketId(ticket.id)] as const,
        ),
      ),
    );
    const metrics = buildDashboardMetrics({ tickets: allTickets, messagesByTicketId });

    const needsAttention = [...escalatedTickets, ...openTickets]
      .slice(0, 5)
      .map((t) => ({
        id: t.id,
        subject: t.subject,
        tenantId: t.tenantId,
        category: t.category,
        status: t.status,
        priority: t.priority,
      }));

    const recentlyResolved = resolvedTickets
      .filter((t) => t.resolvedAt)
      .sort((a, b) => (b.resolvedAt!.getTime() ?? 0) - (a.resolvedAt!.getTime() ?? 0))
      .slice(0, 5)
      .map((t) => ({
        id: t.id,
        subject: t.subject,
        tenantId: t.tenantId,
        category: t.category,
        resolvedAt: t.resolvedAt!.toISOString(),
      }));

    return {
      status: true,
      message: 'Support dashboard retrieved',
      data: {
        ...metrics,
        open: byStatus['open'] ?? 0,
        inProgress: byStatus['in_progress'] ?? 0,
        escalated: byStatus['escalated'] ?? 0,
        waitingOnTenant: byStatus['waiting_on_tenant'] ?? 0,
        resolved: byStatus['resolved'] ?? 0,
        closed: byStatus['closed'] ?? 0,
        resolvedToday,
        byCategory,
        topTenants: byTenant,
        needsAttention,
        recentlyResolved,
      },
    };
  }
}
