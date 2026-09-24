import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import { SUPPORT_TICKET_REPOSITORY, withDisplayId, type SupportTicketRepository } from './support-ticket.repository';
import { InstallerTicketContextService } from './contexts/installation/application/services/installer-ticket-context.service';
import { SUPPORT_MESSAGE_REPOSITORY, type SupportMessageRepository } from './support-message.repository';
import {
  SUPPORT_TICKET_ATTACHMENT_REPOSITORY,
  type SupportTicketAttachmentRepository,
} from './support-ticket-attachment.repository';

@Injectable()
export class GetSystemSupportTicketUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SUPPORT_TICKET_REPOSITORY) private readonly ticketRepo: SupportTicketRepository,
    @Inject(SUPPORT_MESSAGE_REPOSITORY) private readonly messageRepo: SupportMessageRepository,
    @Inject(InstallerTicketContextService) private readonly installerTickets: InstallerTicketContextService,
    @Inject(SUPPORT_TICKET_ATTACHMENT_REPOSITORY)
    private readonly attachmentRepo: SupportTicketAttachmentRepository,
  ) {}

  async execute(accessToken: string, ticketId: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to view support tickets',
    });

    const ticket = await this.ticketRepo.findById(ticketId);
    if (!ticket) throw new NotFoundException(`Ticket ${ticketId} not found`);

    const [messages, facts, attachments] = await Promise.all([
      this.messageRepo.findByTicketId(ticketId),
      this.installerTickets.describe([ticket]),
      this.attachmentRepo.findByTicketId(ticketId),
    ]);

    return {
      status: true,
      message: 'Support ticket retrieved',
      data: {
        ...withDisplayId(ticket),
        reporterName: facts.get(ticket.id)?.reporterName ?? null,
        relatedJob: facts.get(ticket.id)?.relatedJob ?? null,
        escalatedAt: ticket.escalatedAt?.toISOString() ?? null,
        resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
        closedAt: ticket.closedAt?.toISOString() ?? null,
        createdAt: ticket.createdAt.toISOString(),
        updatedAt: ticket.updatedAt.toISOString(),
        messages: messages.map((m) => ({
          ...m,
          createdAt: m.createdAt.toISOString(),
        })),
        attachments: attachments.map((a) => ({
          ...a,
          createdAt: a.createdAt.toISOString(),
        })),
      },
    };
  }
}
