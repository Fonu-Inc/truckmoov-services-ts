import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import {
  SUPPORT_TICKET_REPOSITORY,
  withDisplayId,
  type SupportTicketFilters,
  type SupportTicketRepository,
} from './support-ticket.repository';
import { InstallerTicketContextService } from './contexts/installation/application/services/installer-ticket-context.service';

@Injectable()
export class ListSystemSupportTicketsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SUPPORT_TICKET_REPOSITORY) private readonly ticketRepo: SupportTicketRepository,
    @Inject(InstallerTicketContextService) private readonly installerTickets: InstallerTicketContextService,
  ) {}

  async execute(accessToken: string, filters?: Pick<SupportTicketFilters, 'status' | 'category' | 'search' | 'reporterType'>) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to list support tickets',
    });

    const tickets = await this.ticketRepo.findAll(filters);
    const facts = await this.installerTickets.describe(tickets);
    return {
      status: true,
      message: 'Support tickets retrieved',
      data: {
        total: tickets.length,
        tickets: tickets.map((t) => ({
          ...withDisplayId(t),
          reporterName: facts.get(t.id)?.reporterName ?? null,
          relatedJob: facts.get(t.id)?.relatedJob ?? null,
          escalatedAt: t.escalatedAt?.toISOString() ?? null,
          resolvedAt: t.resolvedAt?.toISOString() ?? null,
          closedAt: t.closedAt?.toISOString() ?? null,
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
        })),
      },
    };
  }
}
