import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor, SYSTEM_MUTATOR_ROLES } from './system-authz';
import { SUPPORT_TICKET_REPOSITORY, type SupportTicketRepository } from './support-ticket.repository';
import { SUPPORT_MESSAGE_REPOSITORY, type SupportMessageRepository } from './support-message.repository';
import { SupportTicketNotifierService } from './support-ticket-notifier.service';
import { randomUUID } from 'crypto';

@Injectable()
export class SendSystemSupportMessageUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SUPPORT_TICKET_REPOSITORY) private readonly ticketRepo: SupportTicketRepository,
    @Inject(SUPPORT_MESSAGE_REPOSITORY) private readonly messageRepo: SupportMessageRepository,
    @Inject(SupportTicketNotifierService) private readonly notifier: SupportTicketNotifierService,
  ) {}

  async execute(
    accessToken: string,
    ticketId: string,
    message: string,
    isInternal: boolean,
  ) {
    const actor = await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      allowedRoles: SYSTEM_MUTATOR_ROLES,
      forbiddenMessage: 'You are not permitted to send ticket messages',
    });

    const ticket = await this.ticketRepo.findById(ticketId);
    if (!ticket) throw new NotFoundException(`Ticket ${ticketId} not found`);

    const now = new Date();
    const newMessage = {
      id: randomUUID(),
      ticketId,
      senderId: actor.id,
      senderName: actor.email,
      senderRole: actor.role,
      message,
      isInternal,
      createdAt: now,
    };

    await this.messageRepo.save(newMessage);

    ticket.updatedAt = now;
    await this.ticketRepo.save(ticket);

    // Internal notes are staff-only and must not tell the tenant anything
    // happened — that would leak that a note exists without showing its content.
    if (!isInternal) {
      await this.notifier.notifyReplied(ticket.tenantId, ticketId);
    }

    return {
      status: true,
      message: 'Message sent',
      data: { ...newMessage, createdAt: newMessage.createdAt.toISOString() },
    };
  }
}
