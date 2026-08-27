import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor, SYSTEM_MUTATOR_ROLES } from './system-authz';
import { SUPPORT_TICKET_REPOSITORY, type SupportTicketRepository } from './support-ticket.repository';
import { SupportTicketNotifierService } from './support-ticket-notifier.service';

const VALID_STATUSES = new Set(['open', 'in_progress', 'waiting_on_tenant', 'escalated', 'resolved', 'closed']);

export class InvalidTicketStatusError extends Error {
  constructor(status: string) {
    super(`Invalid ticket status: ${status}`);
  }
}

@Injectable()
export class UpdateSystemSupportTicketStatusUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SUPPORT_TICKET_REPOSITORY) private readonly ticketRepo: SupportTicketRepository,
    @Inject(SupportTicketNotifierService) private readonly notifier: SupportTicketNotifierService,
  ) {}

  async execute(accessToken: string, ticketId: string, status: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      allowedRoles: SYSTEM_MUTATOR_ROLES,
      forbiddenMessage: 'You are not permitted to update ticket status',
    });

    if (!VALID_STATUSES.has(status)) throw new InvalidTicketStatusError(status);

    const ticket = await this.ticketRepo.findById(ticketId);
    if (!ticket) throw new NotFoundException(`Ticket ${ticketId} not found`);

    const now = new Date();
    ticket.status = status;
    ticket.updatedAt = now;
    if (status === 'resolved') ticket.resolvedAt = now;
    if (status === 'closed') ticket.closedAt = now;

    await this.ticketRepo.save(ticket);
    await this.notifier.notifyStatusChanged(ticket.tenantId, ticketId, status);

    return {
      status: true,
      message: 'Ticket status updated',
      data: { ticketId, status },
    };
  }
}
