import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import { SUPPORT_TICKET_REPOSITORY, withDisplayId, type SupportTicketRepository } from './support-ticket.repository';
import { SUPPORT_MESSAGE_REPOSITORY, type SupportMessageRepository } from './support-message.repository';
import {
  SUPPORT_TICKET_ATTACHMENT_REPOSITORY,
  type SupportTicketAttachmentRepository,
} from './support-ticket-attachment.repository';

/**
 * One ticket with its conversation and attachments. Internal notes are
 * filtered out here — the tenant never sees staff-only messages, the same
 * boundary the list already enforces.
 */
@Injectable()
export class GetMySupportTicketUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SUPPORT_TICKET_REPOSITORY) private readonly ticketRepo: SupportTicketRepository,
    @Inject(SUPPORT_MESSAGE_REPOSITORY) private readonly messageRepo: SupportMessageRepository,
    @Inject(SUPPORT_TICKET_ATTACHMENT_REPOSITORY)
    private readonly attachmentRepo: SupportTicketAttachmentRepository,
  ) {}

  async execute(accessToken: string, ticketId: string) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') {
      throw new ForbiddenError('System actors have no tenant ticket to view');
    }

    const ticket = await this.ticketRepo.findById(ticketId);
    // Not found and belongs-to-someone-else return the same 404. Confirming a
    // ticket id exists for a tenant that cannot see it is its own small leak.
    if (!ticket || ticket.tenantId !== actor.tenantId) {
      throw new NotFoundException(`Ticket ${ticketId} not found`);
    }

    const [allMessages, attachments] = await Promise.all([
      this.messageRepo.findByTicketId(ticketId),
      this.attachmentRepo.findByTicketId(ticketId),
    ]);
    const messages = allMessages.filter((m) => !m.isInternal);

    return { status: true, message: 'success', data: { ticket: withDisplayId(ticket), messages, attachments } };
  }
}
