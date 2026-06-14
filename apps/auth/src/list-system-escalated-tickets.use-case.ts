import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import { SUPPORT_TICKET_REPOSITORY, type SupportTicketRepository } from './support-ticket.repository';

const ESCALATION_PARTIES = ['fleetpro_internal', 'fonu_connectivity', 'vendor_installer'] as const;

@Injectable()
export class ListSystemEscalatedTicketsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SUPPORT_TICKET_REPOSITORY) private readonly ticketRepo: SupportTicketRepository,
  ) {}

  async execute(accessToken: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to view escalated tickets',
    });

    const tickets = await this.ticketRepo.findAll({ status: 'escalated' });

    const grouped = new Map<string, typeof tickets>();
    for (const party of ESCALATION_PARTIES) grouped.set(party, []);
    grouped.set('unspecified', []);

    for (const ticket of tickets) {
      const key = ticket.escalatedTo ?? 'unspecified';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(ticket);
    }

    const parties = [...grouped.entries()].map(([party, partyTickets]) => ({
      party,
      count: partyTickets.length,
      tickets: partyTickets.map((t) => ({
        ...t,
        escalatedAt: t.escalatedAt?.toISOString() ?? null,
        resolvedAt: t.resolvedAt?.toISOString() ?? null,
        closedAt: t.closedAt?.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
    }));

    return {
      status: true,
      message: 'Escalated tickets retrieved',
      data: { total: tickets.length, parties },
    };
  }
}
