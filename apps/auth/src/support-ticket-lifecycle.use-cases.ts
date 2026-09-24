import { randomUUID } from 'crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import { clearEscalation, SUPPORT_TICKET_REPOSITORY, type SupportTicketRepository } from './support-ticket.repository';
import { SUPPORT_MESSAGE_REPOSITORY, type SupportMessageRepository } from './support-message.repository';
export class TicketActionNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TicketActionNotAllowedError';
  }
}

async function loadOwnTicket(
  ticketRepo: SupportTicketRepository,
  ticketId: string,
  tenantId: string,
) {
  const ticket = await ticketRepo.findById(ticketId);
  if (!ticket || ticket.tenantId !== tenantId) {
    throw new NotFoundException(`Ticket ${ticketId} not found`);
  }
  return ticket;
}

export type ReplyToMySupportTicketCommand = {
  accessToken: string;
  ticketId: string;
  message: string;
};

/**
 * The tenant half of the conversation the platform side already has. A reply
 * is what clears waiting_on_tenant — support set that flag, and requiring
 * staff to notice the reply and flip it back manually is how tickets rot.
 */
@Injectable()
export class ReplyToMySupportTicketUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SUPPORT_TICKET_REPOSITORY) private readonly ticketRepo: SupportTicketRepository,
    @Inject(SUPPORT_MESSAGE_REPOSITORY) private readonly messageRepo: SupportMessageRepository,
  ) {}

  async execute(command: ReplyToMySupportTicketCommand) {
    const actor = await resolveActorUser(command.accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') {
      throw new ForbiddenError('System actors cannot reply to a tenant ticket');
    }
    const message = command.message.trim();
    if (!message) throw new TicketActionNotAllowedError('A message is required');

    const ticket = await loadOwnTicket(this.ticketRepo, command.ticketId, actor.tenantId!);
    if (ticket.status === 'closed') {
      throw new TicketActionNotAllowedError('A closed ticket cannot be replied to. Reopen it first.');
    }

    const now = new Date();
    const saved = {
      id: randomUUID(),
      ticketId: ticket.id,
      senderId: actor.id,
      senderName: actor.email,
      senderRole: 'tenant',
      message,
      isInternal: false,
      createdAt: now,
    };
    await this.messageRepo.save(saved);

    const wasWaitingOnTenant = ticket.status === 'waiting_on_tenant';
    ticket.status = wasWaitingOnTenant ? 'in_progress' : ticket.status;
    ticket.updatedAt = now;
    await this.ticketRepo.save(ticket);

    return { message: saved, ticketStatus: ticket.status };
  }
}

export type ChangeMySupportTicketStatusCommand = {
  accessToken: string;
  ticketId: string;
  /** Required for reopen, so support knows what is still wrong. */
  reason?: string;
};

/**
 * Tenant closes their own resolved ticket. Confirms the fix worked, which is
 * the only thing a tenant-initiated close can mean — anything else is support's
 * call and goes through the platform side.
 */
@Injectable()
export class CloseMySupportTicketUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SUPPORT_TICKET_REPOSITORY) private readonly ticketRepo: SupportTicketRepository,
  ) {}

  async execute(command: ChangeMySupportTicketStatusCommand) {
    const actor = await resolveActorUser(command.accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') throw new ForbiddenError('System actors have no tenant ticket to close');

    const ticket = await loadOwnTicket(this.ticketRepo, command.ticketId, actor.tenantId!);
    if (ticket.status !== 'resolved') {
      throw new TicketActionNotAllowedError('Only a resolved ticket can be closed');
    }

    const now = new Date();
    ticket.status = 'closed';
    ticket.closedAt = now;
    ticket.updatedAt = now;
    await this.ticketRepo.save(ticket);

    return { ticket };
  }
}

/**
 * Tenant reopens a resolved ticket the problem persists on.
 *
 * Reopened tickets return to open rather than in_progress: the requirements
 * allow either, but a ticket that was marked resolved and was not fixed needs
 * fresh triage, not to resume wherever staff left off assuming it was done.
 */
@Injectable()
export class ReopenMySupportTicketUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SUPPORT_TICKET_REPOSITORY) private readonly ticketRepo: SupportTicketRepository,
    @Inject(SUPPORT_MESSAGE_REPOSITORY) private readonly messageRepo: SupportMessageRepository,
  ) {}

  async execute(command: ChangeMySupportTicketStatusCommand) {
    const actor = await resolveActorUser(command.accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') throw new ForbiddenError('System actors have no tenant ticket to reopen');

    const reason = command.reason?.trim();
    if (!reason) throw new TicketActionNotAllowedError('A reason is required to reopen a ticket');

    const ticket = await loadOwnTicket(this.ticketRepo, command.ticketId, actor.tenantId!);
    if (ticket.status !== 'resolved') {
      throw new TicketActionNotAllowedError('Only a resolved ticket can be reopened');
    }

    const now = new Date();
    ticket.status = 'open';
    ticket.resolvedAt = null;
    ticket.updatedAt = now;
    clearEscalation(ticket);
    await this.ticketRepo.save(ticket);
    await this.messageRepo.save({
      id: randomUUID(),
      ticketId: ticket.id,
      senderId: actor.id,
      senderName: actor.email,
      senderRole: 'tenant',
      message: `Reopened: ${reason}`,
      isInternal: false,
      createdAt: now,
    });

    return { ticket };
  }
}
