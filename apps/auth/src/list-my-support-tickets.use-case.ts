import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { StoredUser, UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import {
  SUPPORT_TICKET_STATUSES,
  SUPPORT_TICKET_REPOSITORY,
  withDisplayId,
  type SupportTicketFilters,
  type StoredSupportTicket,
  type SupportTicketRepository,
} from './support-ticket.repository';

const MAX_PAGE_SIZE = 100;
/** Callers that send no page get everything, as before, up to this many. */
const UNPAGED_CAP = 500;

function pageOf(paging: { page?: number; limit?: number }) {
  return {
    page: Math.max(1, Math.floor(paging.page ?? 1)),
    limit: Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(paging.limit ?? 20))),
  };
}

function displayName(user: StoredUser | null | undefined): string | null {
  return user?.profile?.fullName?.trim() || user?.email || null;
}

/** Each ticket's reporter as a name (or email), looked up once per distinct user. */
export async function withReporterNames<T extends Pick<StoredSupportTicket, 'createdBy'>>(
  users: Pick<UserRepository, 'findById'>,
  tickets: T[],
): Promise<Array<T & { reporterName: string | null }>> {
  const ids = [...new Set(tickets.map((t) => t.createdBy).filter(Boolean))];
  const found = await Promise.all(ids.map((id) => users.findById(id)));
  const byId = new Map(ids.map((id, i) => [id, displayName(found[i])]));
  return tickets.map((t) => ({ ...t, reporterName: byId.get(t.createdBy) ?? null }));
}

/**
 * The tenant's own tickets only. The platform side deliberately sees all of
 * them; this must never leak across the boundary the other way.
 */
@Injectable()
export class ListMySupportTicketsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SUPPORT_TICKET_REPOSITORY) private readonly ticketRepo: SupportTicketRepository,
  ) {}

  async execute(accessToken: string, filters: SupportTicketFilters = {}, paging: { page?: number; limit?: number } = {}) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') {
      throw new ForbiddenError('System actors have no tenant tickets to list');
    }

    const page = paging.page || paging.limit ? pageOf(paging) : { page: 1, limit: UNPAGED_CAP };
    const createdBy = filters.createdBy === 'me' ? actor.id : filters.createdBy;
    const { items: tickets, total } = await this.ticketRepo.findPageForTenant(actor.tenantId!, { ...filters, createdBy }, page);
    // Every status this tenant's tickets are in, not just the filtered page —
    // the tab chips are aggregates over everything, not the current view.
    const counts = await this.ticketRepo.countByStatusForTenant(actor.tenantId!);
    const byStatus = Object.fromEntries(SUPPORT_TICKET_STATUSES.map((s) => [s, counts[s] ?? 0]));

    return {
      status: true,
      message: 'success',
      data: {
        tickets: await withReporterNames(this.userRepository, tickets.map(withDisplayId)),
        countsByStatus: byStatus,
        total,
        page: page.page,
        limit: page.limit,
      },
    };
  }
}
