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
import type { StoredUser } from './contexts/auth/session/domain/ports/user-repository.port';

function displayName(user: StoredUser | undefined): string | null {
  return user?.profile?.fullName?.trim() || user?.email || null;
}

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
    const creatorIds = tickets.flatMap((ticket) => {
      const known = facts.get(ticket.id)?.reporterName;
      return !known && ticket.createdBy ? [ticket.createdBy] : [];
    });
    const users = await Promise.all([...new Set(creatorIds)].map((id) => this.userRepository.findById(id)));
    const byId = new Map(users.flatMap((user) => (user ? [[user.id, user] as const] : [])));
    return {
      status: true,
      message: 'Support tickets retrieved',
      data: {
        total: tickets.length,
        tickets: tickets.map((t) => ({
          ...withDisplayId(t),
          reporterName: facts.get(t.id)?.reporterName ?? displayName(byId.get(t.createdBy)),
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
