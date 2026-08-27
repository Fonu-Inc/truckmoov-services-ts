import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import {
  SUPPORT_TICKET_STATUSES,
  SUPPORT_TICKET_REPOSITORY,
  type SupportTicketFilters,
  type SupportTicketRepository,
} from './support-ticket.repository';

/**
 * The tenant's own tickets only. The platform side deliberately sees all of
 * them; this must never leak across the boundary the other way.
 */
@Injectable()
export class ListMySupportTicketsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SUPPORT_TICKET_REPOSITORY) private readonly ticketRepo: SupportTicketRepository,
  ) {}

  async execute(accessToken: string, filters: SupportTicketFilters = {}) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') {
      throw new ForbiddenError('System actors have no tenant tickets to list');
    }

    const tickets = await this.ticketRepo.findAllForTenant(actor.tenantId!, filters);
    // Every status this tenant's tickets are in, not just the filtered page —
    // the tab chips are aggregates over everything, not the current view.
    const counts = await this.ticketRepo.countByStatusForTenant(actor.tenantId!);
    const byStatus = Object.fromEntries(SUPPORT_TICKET_STATUSES.map((s) => [s, counts[s] ?? 0]));

    return {
      status: true,
      message: 'success',
      data: { tickets, countsByStatus: byStatus, total: tickets.length },
    };
  }
}
