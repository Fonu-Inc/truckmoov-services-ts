import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import { SUPPORT_TICKET_REPOSITORY, type SupportTicketRepository } from './support-ticket.repository';
import { SUPPORT_MESSAGE_REPOSITORY, type SupportMessageRepository } from './support-message.repository';
import {
  TicketAttachmentUploaderService,
  type TicketAttachmentUpload,
} from './ticket-attachment-uploader.service';

/**
 * Attaches a file to a ticket the caller owns, or to one of their own replies
 * on it. Ownership is checked here rather than trusted from the URL, and a
 * message id that belongs to a different ticket is refused the same way a
 * ticket that belongs to a different tenant is.
 */
@Injectable()
export class AddMyTicketAttachmentUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SUPPORT_TICKET_REPOSITORY) private readonly ticketRepo: SupportTicketRepository,
    @Inject(SUPPORT_MESSAGE_REPOSITORY) private readonly messageRepo: SupportMessageRepository,
    @Inject(TicketAttachmentUploaderService)
    private readonly attachmentUploader: TicketAttachmentUploaderService,
  ) {}

  async execute(input: {
    accessToken: string;
    ticketId: string;
    messageId?: string | null;
    files: TicketAttachmentUpload[];
  }) {
    const actor = await resolveActorUser(input.accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') {
      throw new ForbiddenError('System actors have no tenant ticket to attach to');
    }

    const ticket = await this.ticketRepo.findById(input.ticketId);
    if (!ticket || ticket.tenantId !== actor.tenantId) {
      throw new NotFoundException(`Ticket ${input.ticketId} not found`);
    }

    if (input.messageId) {
      const messages = await this.messageRepo.findByTicketId(input.ticketId);
      const owned = messages.some((m) => m.id === input.messageId && m.senderId === actor.id);
      if (!owned) throw new NotFoundException(`Message ${input.messageId} not found`);
    }

    return this.attachmentUploader.upload({
      tenantId: ticket.tenantId,
      ticketId: ticket.id,
      messageId: input.messageId ?? null,
      uploadedBy: actor.id,
      files: input.files,
    });
  }
}
