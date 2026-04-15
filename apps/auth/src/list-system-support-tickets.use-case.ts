import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import { SUPPORT_TICKET_REPOSITORY, type SupportTicketRepository } from './support-ticket.repository';

@Injectable()
export class ListSystemSupportTicketsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SUPPORT_TICKET_REPOSITORY) private readonly ticketRepo: SupportTicketRepository,
  ) {}

  async execute(accessToken: string, filters?: { status?: string; category?: string; search?: string }) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to list support tickets',
    });

    const tickets = await this.ticketRepo.findAll(filters);
    return {
      status: true,
      message: 'Support tickets retrieved',
      data: {
        total: tickets.length,
        tickets: tickets.map((t) => ({
          ...t,
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
