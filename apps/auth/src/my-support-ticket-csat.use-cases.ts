import { randomUUID } from 'crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ForbiddenError, TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { SUPPORT_TICKET_REPOSITORY, type SupportTicketRepository } from './support-ticket.repository';
import {
  SUPPORT_TICKET_CSAT_REPOSITORY,
  type StoredSupportTicketCsat,
  type SupportTicketCsatRepository,
} from './support-ticket-csat.repository';
import { TicketActionNotAllowedError } from './support-ticket-lifecycle.use-cases';

const RATEABLE_STATUSES = new Set(['resolved', 'closed']);

export type TicketCsatView = {
  rating: number;
  comment: string | null;
  wouldRecommend: boolean | null;
  userId: string;
  createdAt: string;
};

export function toCsatView(csat: StoredSupportTicketCsat | null): TicketCsatView | null {
  if (!csat) return null;
  return {
    rating: csat.rating,
    comment: csat.comment,
    wouldRecommend: csat.wouldRecommend,
    userId: csat.userId,
    createdAt: csat.createdAt.toISOString(),
  };
}

export type SubmitTicketCsatCommand = {
  accessToken: string;
  ticketId: string;
  rating: number;
  comment?: string | null;
  wouldRecommend?: boolean | null;
};

/** Tickets are shared across the account, so any user of it may read or give the single rating. */
@Injectable()
export class MyTicketCsatUseCases {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SUPPORT_TICKET_REPOSITORY) private readonly ticketRepo: SupportTicketRepository,
    @Inject(SUPPORT_TICKET_CSAT_REPOSITORY) private readonly csatRepo: SupportTicketCsatRepository,
  ) {}

  async get(accessToken: string, ticketId: string): Promise<TicketCsatView | null> {
    const { ticket } = await this.ownTicket(accessToken, ticketId);
    return toCsatView(await this.csatRepo.findByTicketId(ticket.id));
  }

  async submit(command: SubmitTicketCsatCommand): Promise<TicketCsatView> {
    const { actor, ticket } = await this.ownTicket(command.accessToken, command.ticketId);
    if (!RATEABLE_STATUSES.has(ticket.status)) {
      throw new TicketActionNotAllowedError('A ticket can be rated once it is resolved or closed');
    }
    if (!Number.isInteger(command.rating) || command.rating < 1 || command.rating > 5) {
      throw new TicketActionNotAllowedError('rating must be a whole number from 1 to 5');
    }

    const csat: StoredSupportTicketCsat = {
      id: randomUUID(),
      ticketId: ticket.id,
      tenantId: ticket.tenantId,
      userId: actor.id,
      rating: command.rating,
      comment: command.comment?.trim() || null,
      wouldRecommend: command.wouldRecommend ?? null,
      createdAt: new Date(),
    };
    await this.csatRepo.insert(csat);
    return toCsatView(csat)!;
  }

  private async ownTicket(accessToken: string, ticketId: string) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') throw new ForbiddenError('System actors have no tenant ticket to rate');
    const ticket = await this.ticketRepo.findById(ticketId);
    if (!ticket || ticket.tenantId !== actor.tenantId) throw new NotFoundException(`Ticket ${ticketId} not found`);
    return { actor, ticket };
  }
}
