import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ObjectStorageService } from '@shared/object-storage';
import { ForbiddenError, TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { SUPPORT_TICKET_REPOSITORY, type SupportTicketRepository } from './support-ticket.repository';
import {
  SUPPORT_TICKET_ATTACHMENT_REPOSITORY,
  type SupportTicketAttachmentRepository,
} from './support-ticket-attachment.repository';

const LINK_TTL_SECONDS = 300;

/** A five-minute download link for one attachment on a ticket of the caller's own account. */
@Injectable()
export class GetMyTicketAttachmentLinkUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SUPPORT_TICKET_REPOSITORY) private readonly ticketRepo: SupportTicketRepository,
    @Inject(SUPPORT_TICKET_ATTACHMENT_REPOSITORY)
    private readonly attachmentRepo: SupportTicketAttachmentRepository,
    @Inject(ObjectStorageService) private readonly storage: ObjectStorageService,
  ) {}

  async execute(accessToken: string, ticketId: string, attachmentId: string) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') throw new ForbiddenError('System actors have no tenant ticket to read');

    const ticket = await this.ticketRepo.findById(ticketId);
    if (!ticket || ticket.tenantId !== actor.tenantId) throw new NotFoundException(`Ticket ${ticketId} not found`);
    const attachment = (await this.attachmentRepo.findByTicketId(ticket.id)).find((a) => a.id === attachmentId);
    if (!attachment) throw new NotFoundException('Attachment not found');

    const expiresAt = new Date(Date.now() + LINK_TTL_SECONDS * 1000);
    const url = await this.storage.createPresignedDownloadUrl({
      key: attachment.key,
      expiresIn: LINK_TTL_SECONDS,
      responseContentType: attachment.contentType,
      // Images open inline for the thumbnail and preview; everything else downloads under its own name.
      responseContentDisposition: attachment.contentType.startsWith('image/')
        ? 'inline'
        : `attachment; filename="${attachment.filename.replace(/["\\\r\n]/g, '_')}"`,
    });
    return {
      id: attachment.id,
      fileName: attachment.filename,
      size: attachment.sizeBytes,
      mimeType: attachment.contentType,
      url,
      expiresAt: expiresAt.toISOString(),
    };
  }
}
