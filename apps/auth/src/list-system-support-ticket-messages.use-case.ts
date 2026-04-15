import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import { SUPPORT_TICKET_REPOSITORY, type SupportTicketRepository } from './support-ticket.repository';
import { SUPPORT_MESSAGE_REPOSITORY, type SupportMessageRepository } from './support-message.repository';

@Injectable()
export class ListSystemSupportTicketMessagesUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SUPPORT_TICKET_REPOSITORY) private readonly ticketRepo: SupportTicketRepository,
    @Inject(SUPPORT_MESSAGE_REPOSITORY) private readonly messageRepo: SupportMessageRepository,
  ) {}

  async execute(accessToken: string, ticketId: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to view ticket messages',
    });

    const ticket = await this.ticketRepo.findById(ticketId);
    if (!ticket) throw new NotFoundException(`Ticket ${ticketId} not found`);

    const messages = await this.messageRepo.findByTicketId(ticketId);

    return {
      status: true,
      message: 'Ticket messages retrieved',
      data: {
        ticketId,
        total: messages.length,
        messages: messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })),
      },
    };
  }
}
